import asyncio
from datetime import date, timedelta

import httpx

from app import journal, schedule, telephony
from app.dialog import state
from app.stand_client import StandError

WAITING = ("ожидает", "не дозвонились")


class MisUnavailable(Exception):
    """МИС не ответила — список записей получить нельзя."""


class Busy(Exception):
    """Уже идёт звонок: софтфон один, звоним по одному."""


class VisitNotFound(Exception):
    """Такой будущей записи нет."""


_campaign: asyncio.Task | None = None


def next_working_day(today: date) -> date:
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
    d = next_working_day(schedule.now().date()).strftime("%d.%m.%Y")
    return await _visits(date_from=d, date_to=d)


async def upcoming_visits() -> list[dict]:
    now = schedule.now()
    return [v for v in await _visits() if schedule.from_api(v["scheduled_at"]) > now]


def status_of(visit_id: int) -> dict:
    return journal.REMINDERS.setdefault(visit_id, {"status": "ожидает"})


async def reminder_rows() -> list[dict]:
    return [{"visit_id": v["id"], "patient": f"пациент № {v['client_id']}",
             "doctor": v["doctor"]["full_name"], "specialty": v["doctor"]["specialty"],
             "scheduled_at": v["scheduled_at"], "status": status_of(v["id"])["status"],
             "new_time": status_of(v["id"]).get("new_time")}
            for v in await tomorrow_visits()]


def is_busy() -> bool:
    return _campaign is not None and not _campaign.done()


async def _ring_all(visits: list[dict]):
    for v in visits:
        outcome = await telephony.call_reminder(v)
        r = journal.REMINDERS.setdefault(v["id"], {})
        if outcome in ("не дозвонились", "ошибка звонка"):
            r["status"] = outcome
        elif r.get("status") in (None, "ожидает", "в очереди", "звоним"):
            r["status"] = "без ответа"
        journal.save()


def _start(visits: list[dict]):
    global _campaign
    _campaign = asyncio.create_task(_ring_all(visits))


async def start_campaign() -> int | None:
    if is_busy():
        return None
    visits = [v for v in await tomorrow_visits() if status_of(v["id"])["status"] in WAITING]
    for v in visits:
        status_of(v["id"])["status"] = "в очереди"
    journal.save()
    _start(visits)
    return len(visits)


async def call_one(visit_id: int):
    visits = [v for v in await upcoming_visits() if v["id"] == visit_id]
    if not visits:
        raise VisitNotFound(visit_id)
    if is_busy():
        raise Busy()
    _start(visits)
