# Обзвон с напоминаниями (сценарий С-10): кого звать, в каком порядке и как записать итог.
# HTTP здесь нет — эндпоинты в app/main.py только вызывают эти функции и переводят ошибки в коды ответа.
import asyncio
from datetime import date, timedelta

import httpx

import time

from app import config, journal, schedule, telephony
from app.dialog import state
from app.stand_client import StandError

WAITING = ("ожидает", "не дозвонились")  # кому звонить при следующем обзвоне

# ---------- Правила С-10 (регламент + ответы организаторов 21.10) ----------
# Для проверяющего: обзвон «Обзвонить всех» соблюдает правила С-10:
#   • окно обзвона: будни 10:00–19:00, суббота 10:00–15:00, в воскресенье не звоним (часы клиники, GMT+4);
#   • не больше 2 попыток с интервалом не меньше 2 часов; не дозвонились — SMS-напоминание (строка в комментарии);
#   • не звоним, если запись создана меньше 24 часов назад, есть отказ от обзвона или запись уже подтверждена.
# Демонстрация вне окна (техчекпоинт идёт вечером): REMINDER_DEMO=1 в .env — на демо говорим, что включён демо-режим.
# Кнопка «Позвонить» у одной записи — ручное действие регистратора, окно на неё не действует.
# Тесты: test_reminder_window, test_reminder_skips_opt_out_and_confirmed, test_reminder_two_attempts_then_sms.
MAX_ATTEMPTS = 2
RETRY_AFTER_SEC = 2 * 3600


def in_call_window(now) -> bool:
    if now.weekday() == 6 or now.date() in schedule.HOLIDAYS:
        return False
    end = 15 if now.weekday() == 5 else 19
    return 10 <= now.hour < end


def _created_recently(v: dict) -> bool:
    raw = v.get("created_at")
    if not raw:
        return False  # стенд не отдаёт дату создания — правило проверить нельзя, звоним
    try:
        return (schedule.now() - schedule.from_api(raw)).total_seconds() < 24 * 3600
    except ValueError:
        return False


def _blocked_by_comment(comment: str, visit_id: int) -> bool:
    return ("Отказ от обзвона" in comment or "Отказ от уведомлений" in comment
            or f"Подтверждена запись #{visit_id} " in comment)


class MisUnavailable(Exception):
    """МИС не ответила — список записей получить нельзя."""


class Busy(Exception):
    """Уже идёт звонок: софтфон один, звоним по одному."""


class OutsideWindow(Exception):
    """Вне окна обзвона С-10 (будни 10–19, суббота 10–15, воскресенье — нет)."""


class VisitNotFound(Exception):
    """Такой будущей записи нет."""


_campaign: asyncio.Task | None = None


def next_working_day(today: date) -> date:
    """Следующий день, когда поликлиника принимает (воскресенье — выходной)."""
    day = today + timedelta(days=1)
    while day.weekday() == 6:
        day += timedelta(days=1)
    return day


async def _visits(**filters) -> list[dict]:
    if not state.stand:
        return []
    try:
        return await state.stand.list_visits(status="Запланирована", **filters)
    except (StandError, httpx.HTTPError) as e:
        raise MisUnavailable(str(e)) from e


async def tomorrow_visits() -> list[dict]:
    """Записи на следующий рабочий день — кому звонить с напоминанием."""
    d = next_working_day(schedule.now().date()).strftime("%d.%m.%Y")
    return await _visits(date_from=d, date_to=d)


async def upcoming_visits() -> list[dict]:
    """Все будущие запланированные записи (для звонка по одной записи)."""
    now = schedule.now()
    return [v for v in await _visits() if schedule.from_api(v["scheduled_at"]) > now]


def status_of(visit_id: int) -> dict:
    return journal.REMINDERS.setdefault(visit_id, {"status": "ожидает"})


_rows_cache: dict = {"at": 0.0, "visits": []}
ROWS_TTL = 60.0


async def reminder_rows() -> list[dict]:
    """Строки экрана «Напоминания»: запись + статус обзвона.
    Список записей кэшируется на минуту: кабинет опрашивает экран каждые несколько секунд, и раньше
    каждый опрос тратил запрос к стенду из общего лимита — живой звонок ждал (техчекпоинт 23.10)."""
    if time.time() - _rows_cache["at"] > ROWS_TTL:
        _rows_cache.update(at=time.time(), visits=await tomorrow_visits())
    return [{"visit_id": v["id"], "patient": f"пациент № {v['client_id']}",
             "doctor": v["doctor"]["full_name"], "specialty": v["doctor"]["specialty"],
             "scheduled_at": v["scheduled_at"], "status": status_of(v["id"])["status"],
             "new_time": status_of(v["id"]).get("new_time")}
            for v in _rows_cache["visits"]]


def is_busy() -> bool:
    return _campaign is not None and not _campaign.done()


async def _ring_all(visits: list[dict]):
    """Звоним по очереди. Итог разговора (подтвердил/отменил/перенёс) пишет сам диалог,
    здесь — только случаи, когда разговора не было."""
    for v in visits:
        r = journal.REMINDERS.setdefault(v["id"], {})
        r["attempts"] = r.get("attempts", 0) + 1
        r["last_try"] = time.time()
        outcome = await telephony.call_reminder(v)
        if outcome in ("не дозвонились", "ошибка звонка"):
            r["status"] = outcome
            if r["attempts"] >= MAX_ATTEMPTS:  # 2 попытки — дальше только SMS-напоминание
                r["status"] = "без ответа"
                await _note_sms(v)
        elif r.get("status") in (None, "ожидает", "в очереди", "звоним"):
            r["status"] = "без ответа"
        journal.save()


async def _note_sms(v: dict):
    """Не дозвонились — SMS-напоминание: строка «SMS Напоминание #id ДД.ММ.ГГГГ ЧЧ:ММ» в комментарий клиента."""
    from app.dialog.mis import append_comment
    try:
        await append_comment(v["client_id"], [f"SMS Напоминание #{v['id']} {schedule.now().strftime('%d.%m.%Y %H:%M')}"])
    except Exception:  # noqa: BLE001 — МИС недоступна: статус «без ответа» уже в журнале
        pass


async def due_for_call(visits: list[dict]) -> list[dict]:
    """Кому звонить сейчас по правилам С-10."""
    out = []
    for v in visits:
        r = status_of(v["id"])
        if r["status"] not in WAITING or r.get("attempts", 0) >= MAX_ATTEMPTS or _created_recently(v):
            continue
        if not config.REMINDER_DEMO and time.time() - r.get("last_try", 0) < RETRY_AFTER_SEC:
            continue
        try:
            comment = ((await state.stand.get_client(v["client_id"])) or {}).get("comment") or ""
        except Exception:  # noqa: BLE001 — не прочитали карточку: звоним, отказ проверит сам разговор
            comment = ""
        if _blocked_by_comment(comment, v["id"]):
            r["status"] = "подтвердил" if f"#{v['id']} " in comment else "отказ от обзвона"
            continue
        out.append(v)
    return out


def _start(visits: list[dict]):
    global _campaign
    _campaign = asyncio.create_task(_ring_all(visits))


async def start_campaign() -> int | None:
    """Обзвонить всех, кто ждёт напоминания. None — обзвон уже идёт."""
    if is_busy():
        return None
    if not config.REMINDER_DEMO and not in_call_window(schedule.now()):
        raise OutsideWindow()
    visits = await due_for_call(await tomorrow_visits())
    for v in visits:
        status_of(v["id"])["status"] = "в очереди"
    journal.save()
    _start(visits)
    return len(visits)


async def call_one(visit_id: int):
    """Позвонить с напоминанием по одной записи."""
    visits = [v for v in await upcoming_visits() if v["id"] == visit_id]
    if not visits:
        raise VisitNotFound(visit_id)
    if is_busy():
        raise Busy()
    _start(visits)
