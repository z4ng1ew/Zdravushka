# Все операции с МИС в одном месте. Любой сбой стенда превращается в StandDown → перевод (R-06).
from datetime import timedelta

import asyncio

import httpx

from app import journal, schedule
from app.dialog import state
from app.dialog.state import StandDown
from app.models import Booking
from app.ports import MisPort, SlotLock
from app.stand_client import StandError
from app.dialog.session import Session

# Все операции идут через один клиент стенда (StandClient). Режима «без МИС» нет:
# если стенд не настроен или не отвечает — честный перевод на регистратора (R-06), а не выдуманная запись.

# Блокировка на «проверку свободного слота + запись в МИС» (стенд занятость не проверяет).
# Решение работает одним процессом (run.sh: uvicorn без --workers), поэтому достаточно asyncio.Lock.
# Для нескольких инстансов подставляется распределённая реализация порта SlotLock (app/ports.py).
BOOKING_LOCK: SlotLock = asyncio.Lock()


def api() -> MisPort:
    if state.stand is None:
        raise StandDown("стенд не настроен: нет DBI_API_TOKEN и не включён STAND_MODE=mock")
    return state.stand


async def call_mis(s: Session, method: str, path: str, coro):
    """Вызов стенда с записью в журнал звонка. Любой сбой → StandDown → перевод (R-06)."""
    try:
        result = await coro
    except StandError as e:
        journal.stand_request(s.call, method, path, e.status, e.message)
        if e.status in (400, 409) and "врач" in e.message.lower():  # врача деактивировали — обновим справочник
            getattr(state.stand, "invalidate_doctors", lambda: None)()
        raise StandDown(e.message) from e
    except (httpx.HTTPError, ValueError, KeyError, TypeError) as e:  # нет ответа или ответ не того формата
        journal.stand_request(s.call, method, path, 0, "нет ответа или неверный ответ")
        raise StandDown(str(e)) from e
    journal.stand_request(s.call, method, path, 201 if method == "POST" else 200)
    return result


async def doctors_for(specialty: str) -> list[dict]:
    """Активные врачи специальности, у которых есть расписание."""
    docs = await api().active_doctors(specialty)
    return [d for d in docs if schedule.excel_doctor(d["full_name"])]


async def busy_slots(s: Session) -> set[tuple[int, str]]:
    """Наши запланированные записи на ближайшие 45 дней — одним запросом (экономим лимит)."""
    today = schedule.now().date()
    visits = await call_mis(s, "GET", "/visits", api().list_visits(
        status="Запланирована", date_from=today.strftime("%d.%m.%Y"),
        date_to=(today + timedelta(days=45)).strftime("%d.%m.%Y")))
    return {(v["doctor"]["id"], v["scheduled_at"]) for v in visits}


async def identify(s: Session, create: bool = True) -> dict | None:
    """Поиск пациента по фамилии, имени и дате рождения.
    create=True (запись, вызов на дом) — нет в МИС → заводим карточку;
    create=False (перенос, отмена, статус) — нет в МИС → None: заводить карточку незачем, записей у неё нет."""
    c = s.fields
    client = await call_mis(s, "GET", "/clients", api().find_client(c["last_name"], c["first_name"], c["birth_date"]))
    if not client and not create:
        return None
    if not client:
        client = await call_mis(s, "POST", "/clients", api().create_client(
            c["last_name"], c["first_name"], c["birth_date"], c.get("middle_name"),
            comment="Карточка заведена голосовым ассистентом"))
    s.client = client
    s.call["patient"] = journal.mask_name(c["last_name"], c["first_name"], c.get("middle_name"))
    return client


async def client_visits(s: Session) -> list[dict]:
    """Будущие запланированные записи пациента, по времени."""
    visits = await call_mis(s, "GET", "/visits", api().list_visits(client_id=s.client["id"], status="Запланирована"))
    now = schedule.now()
    return sorted([v for v in visits if schedule.from_api(v["scheduled_at"]) > now],
                  key=lambda v: schedule.from_api(v["scheduled_at"]))


async def create_visit(s: Session, o: Booking) -> dict:
    return await call_mis(s, "POST", "/visits", api().create_visit(s.client["id"], o.doctor_id, o.scheduled_at))


async def reschedule_visit(s: Session, visit: dict, o: Booking) -> dict:
    return await call_mis(s, "PATCH", f"/visits/{visit['id']}", api().reschedule_visit(visit["id"], o.scheduled_at))


async def cancel_visit(s: Session, visit: dict) -> dict:
    return await call_mis(s, "PATCH", f"/visits/{visit['id']}", api().cancel_visit(visit["id"]))


async def add_comment(s: Session, note: str):
    """Комментарий в карточку пациента (подтверждение визита, вызов на дом)."""
    await call_mis(s, "PATCH", f"/clients/{s.client['id']}", api().update_client_comment(s.client["id"], note))
