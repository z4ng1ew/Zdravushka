from datetime import timedelta

import httpx

from app import journal, schedule
from app.dialog import state
from app.dialog.state import StandDown
from app.models import Booking
from app.stand_client import StandClient, StandError


def api() -> StandClient:
    if state.stand is None:
        raise StandDown("стенд не настроен: нет DBI_API_TOKEN и не включён STAND_MODE=mock")
    return state.stand


async def call_mis(s: dict, method: str, path: str, coro):
    try:
        result = await coro
    except StandError as e:
        journal.stand_request(s["call"], method, path, e.status, e.message)
        raise StandDown(e.message) from e
    except (httpx.HTTPError, ValueError, KeyError, TypeError) as e:
        journal.stand_request(s["call"], method, path, 0, "нет ответа или неверный ответ")
        raise StandDown(str(e)) from e
    journal.stand_request(s["call"], method, path, 201 if method == "POST" else 200)
    return result


async def doctors_for(specialty: str) -> list[dict]:
    docs = await api().active_doctors(specialty)
    return [d for d in docs if schedule.excel_doctor(d["full_name"])]


async def busy_slots(s: dict) -> set[tuple[int, str]]:
    today = schedule.now().date()
    visits = await call_mis(s, "GET", "/visits", api().list_visits(
        status="Запланирована", date_from=today.strftime("%d.%m.%Y"),
        date_to=(today + timedelta(days=45)).strftime("%d.%m.%Y")))
    return {(v["doctor"]["id"], v["scheduled_at"]) for v in visits}


async def identify(s: dict) -> dict:
    c = s["c"]
    client = await call_mis(s, "GET", "/clients", api().find_client(c["last_name"], c["first_name"], c["birth_date"]))
    if not client:
        client = await call_mis(s, "POST", "/clients", api().create_client(
            c["last_name"], c["first_name"], c["birth_date"], c.get("middle_name"),
            comment="Карточка заведена голосовым ассистентом"))
    s["client"] = client
    s["call"]["patient"] = journal.mask_name(c["last_name"], c["first_name"], c.get("middle_name"))
    return client


async def client_visits(s: dict) -> list[dict]:
    visits = await call_mis(s, "GET", "/visits", api().list_visits(client_id=s["client"]["id"], status="Запланирована"))
    now = schedule.now()
    return sorted([v for v in visits if schedule.from_api(v["scheduled_at"]) > now],
                  key=lambda v: schedule.from_api(v["scheduled_at"]))


async def create_visit(s: dict, o: Booking) -> dict:
    return await call_mis(s, "POST", "/visits", api().create_visit(s["client"]["id"], o.doctor_id, o.scheduled_at))


async def reschedule_visit(s: dict, visit: dict, o: Booking) -> dict:
    return await call_mis(s, "PATCH", f"/visits/{visit['id']}", api().reschedule_visit(visit["id"], o.scheduled_at))


async def cancel_visit(s: dict, visit: dict) -> dict:
    return await call_mis(s, "PATCH", f"/visits/{visit['id']}", api().cancel_visit(visit["id"]))


async def add_comment(s: dict, note: str):
    await call_mis(s, "PATCH", f"/clients/{s['client']['id']}", api().update_client_comment(s["client"]["id"], note))
