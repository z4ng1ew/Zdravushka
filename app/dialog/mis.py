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
    """Вызов стенда с записью в журнал звонка. Любой сбой → StandDown → перевод (R-06).
    Пока запрос идёт, в звонке отмечено время его начала — по нему телефония говорит «Одну секунду, проверяю
    расписание», только если ждём именно МИС дольше 1,5 с (регламент), а не нейросеть."""
    import time
    s.call["_mis_since"] = time.monotonic()
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
    finally:
        s.call.pop("_mis_since", None)
    journal.stand_request(s.call, method, path, 201 if method == "POST" else 200)
    return result


async def doctors_for(specialty: str) -> list[dict]:
    """Активные врачи специальности, у которых есть расписание."""
    docs = await api().active_doctors(specialty)
    return [d for d in docs if schedule.excel_doctor(d["full_name"])]


# Занятые слоты кэшируются на BUSY_TTL секунд и дополняются нашими записями сразу (техчекпоинт 23.10:
# одна запись делала до 5 GET /visits — при лимите стенда 10 запросов/мин это и давало паузы).
# Перед созданием записи слот всё равно перепроверяется свежим запросом (fresh=True) под блокировкой.
BUSY_TTL = 60.0
_busy_cache: dict = {"at": 0.0, "slots": set()}


def busy_changed(doctor_id: int | None = None, slot: str | None = None, freed: str | None = None):
    """Наша запись/перенос/отмена — обновляем кэш занятости без запроса к стенду."""
    if doctor_id is not None and slot:
        _busy_cache["slots"].add((doctor_id, slot))
    if doctor_id is not None and freed:
        _busy_cache["slots"].discard((doctor_id, freed))


async def busy_slots(s: Session, fresh: bool = False) -> set[tuple[int, str]]:
    """Наши запланированные записи на ближайшие 45 дней — одним запросом (экономим лимит)."""
    import time
    if not fresh and time.monotonic() - _busy_cache["at"] < BUSY_TTL:
        return set(_busy_cache["slots"])
    today = schedule.now().date()
    visits = await call_mis(s, "GET", "/visits", api().list_visits(
        status="Запланирована", date_from=today.strftime("%d.%m.%Y"),
        date_to=(today + timedelta(days=45)).strftime("%d.%m.%Y")))
    _busy_cache.update(at=time.monotonic(), slots={(v["doctor"]["id"], v["scheduled_at"]) for v in visits})
    return set(_busy_cache["slots"])


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
    visit = await call_mis(s, "POST", "/visits", api().create_visit(s.client["id"], o.doctor_id, o.scheduled_at))
    busy_changed(o.doctor_id, o.scheduled_at)
    sms(s, "Перенос" if s.replace_visit else "Запись создана", visit["id"])
    return visit


async def reschedule_visit(s: Session, visit: dict, o: Booking) -> dict:
    updated = await call_mis(s, "PATCH", f"/visits/{visit['id']}", api().reschedule_visit(visit["id"], o.scheduled_at))
    busy_changed(o.doctor_id, o.scheduled_at, freed=visit["scheduled_at"])
    sms(s, "Перенос", visit["id"])
    return updated


async def cancel_visit(s: Session, visit: dict, notify: bool = True) -> dict:
    updated = await call_mis(s, "PATCH", f"/visits/{visit['id']}", api().cancel_visit(visit["id"]))
    busy_changed(visit["doctor"]["id"], freed=visit["scheduled_at"])
    if notify:  # при переносе к другому врачу старую отменяем молча: пациент получает одно SMS «Перенос»
        sms(s, "Отмена", visit["id"])
    return updated


# ---------- Отметки в карточке пациента (формат организаторов, чат хакатона 21–22.10) ----------
# Для проверяющего: SMS ассистент не отправляет — по договорённости с организаторами каждое «SMS»
# фиксируется строкой в комментарии клиента (PATCH /clients/{id}, поле comment):
#   SMS <событие> #<id записи> ДД.ММ.ГГГГ ЧЧ:ММ   — событие = шаблон из Приложения Б регламента,
#                                                   время — момент отправки; без записи #<id> не пишется;
#   Подтверждена запись #<id> ДД.ММ.ГГГГ ЧЧ:ММ    — время приёма (звонок-напоминание С-10);
#   Отказ от обзвона ДД.ММ.ГГГГ                    — «не звоните мне больше» (код OPT_OUT).
# PATCH заменяет комментарий целиком, поэтому сначала читаем текущий и дописываем строки (append_comment).
# Тесты: test_sms_lines_written_to_client_comment, test_comment_is_appended_not_replaced,
#        test_reminder_confirmation_line_format, test_reminder_opt_out.

def sms(s: Session, event: str, visit_id: int | None = None):
    """Отметка «SMS отправлено» (Приложение Б) — в очередь на запись в карточку пациента."""
    when = schedule.now().strftime("%d.%m.%Y %H:%M")
    s.notes.append(f"SMS {event} #{visit_id} {when}" if visit_id else f"SMS {event} {when}")


async def append_comment(client_id: int, lines: list[str]):
    """Дописать строки в комментарий клиента, не стирая прежние отметки."""
    current = ((await api().get_client(client_id)) or {}).get("comment") or ""
    await api().update_client_comment(client_id, fit_comment(current.splitlines() + lines))


COMMENT_MAX = 1000  # лимит стенда на поле comment (ответ 400, живой звонок 27.10)


def fit_comment(lines: list[str]) -> str:
    """Комментарий не длиннее лимита стенда: убираем самые старые отметки, но отказ от обзвона
    и уведомлений сохраняем всегда — по ним решается, звонить ли пациенту."""
    lines = [ln for ln in lines if ln.strip()]
    keep = lambda ln: ln.startswith(("Отказ от обзвона", "Отказ от уведомлений"))  # noqa: E731
    while len("\n".join(lines)) > COMMENT_MAX:
        idx = next((i for i, ln in enumerate(lines) if not keep(ln)), None)
        if idx is None or len(lines) == 1:
            return "\n".join(lines)[-COMMENT_MAX:]
        lines.pop(idx)
    return "\n".join(lines)


async def flush_notes(s: Session):
    """Записать накопленные отметки разговора одним чтением и одной записью (лимит стенда 10 запросов/мин).
    Сбой МИС здесь не ломает разговор: действие уже выполнено, отметка останется в журнале."""
    if not (s.notes and s.client):
        return
    lines, s.notes = s.notes, []
    try:
        await append_comment(s.client["id"], lines)
        journal.stand_request(s.call, "PATCH", f"/clients/{s.client['id']}", 200, "; ".join(lines)[:120])
    except Exception as e:  # noqa: BLE001
        journal.stand_request(s.call, "PATCH", f"/clients/{s.client['id']}", 0, f"отметка не записана: {e}"[:120])


async def add_comment(s: Session, note: str):
    """Строка в комментарий карточки пациента (вызов на дом) — дописывается к прежним."""
    s.notes.append(note)
