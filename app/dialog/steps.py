from datetime import datetime

from app import schedule
from app.dialog.common import escalate, reply, task_done
from app.dialog.mis import busy_slots, client_visits, identify
from app.models import Booking, ChatResponse, Escalation
from app.dialog.session import Session


def short_name(name: str) -> str:
    parts = name.split()
    return " ".join([parts[0]] + [f"{p[0]}." for p in parts[1:]])


def is_same_doctor(full_name: str, wanted: str) -> bool:
    a = full_name.split()[0].lower().replace("ё", "е")
    b = wanted.split()[0].lower().replace("ё", "е")
    n = max(4, min(len(a), len(b)) - 2)
    return a[:n] == b[:n]


def wanted_specialty(wanted: str) -> str | None:
    doc = next((d for d in schedule.demo_doctors() if is_same_doctor(d["full_name"], wanted)), None)
    return doc["specialty"] if doc else None


def room(name: str) -> str:
    doc = schedule.excel_doctor(name) or {}
    return f", кабинет {doc['cabinet']}" if doc.get("cabinet") else ""


def make_booking(doc: dict, slot: datetime) -> Booking:
    return Booking(doctor_id=doc["id"], doctor_name=doc["full_name"], specialty=doc["specialty"],
                   scheduled_at=schedule.to_api(slot), spoken=schedule.say_slot(slot))


def visit_booking(v: dict) -> Booking:
    dt = schedule.from_api(v["scheduled_at"])
    return Booking(visit_id=v["id"], doctor_id=v["doctor"]["id"], doctor_name=v["doctor"]["full_name"],
                   specialty=v["doctor"]["specialty"], scheduled_at=v["scheduled_at"],
                   spoken=schedule.say_slot(dt), status=v["status"])


async def need_identity(s: Session) -> ChatResponse | None:
    if s.client:
        return None
    c = s.fields
    if not (c.get("last_name") and c.get("first_name")):
        s.step = "identity"
        return reply(s, "Назовите, пожалуйста, фамилию, имя, отчество и дату рождения пациента.")
    if not c.get("birth_date"):
        again = s.step == "birth_date"
        s.step = "birth_date"
        if again:
            return reply(s, "Назовите дату рождения полностью: число, месяц и год. "
                             "Например: первое января тысяча девятьсот восемьдесят пятого.")
        return reply(s, "Назовите дату рождения пациента.")
    await identify(s)
    return None


async def offer_slots(s: Session, doctors: list[dict], exclude: str | None = None) -> ChatResponse:
    c = s.fields
    busy = await busy_slots(s)
    if exclude:
        busy.add(exclude)
    want = datetime.strptime(c["date"], "%d.%m.%Y").date() if c.get("date") else None
    found = schedule.find_free_slots(doctors, busy, date_from=want, date_to=want,
                                     part_of_day=c.get("part_of_day")) if want else []
    note = ""
    if want and not found:
        note = "На этот день свободного времени нет. "
    if not found:
        found = schedule.find_free_slots(doctors, busy, date_from=want, part_of_day=c.get("part_of_day"))
    if not found and c.get("part_of_day"):
        found = schedule.find_free_slots(doctors, busy, date_from=want)
    if not found:
        return await escalate(s, Escalation(rule="R-08", reason="лист ожидания", priority="P3",
                                       summary="Нет свободного времени в ближайший месяц — лист ожидания"))
    s.options = [make_booking(d, t) for d, t in found]
    s.step = "choose_slot"
    words = ["первый", "второй", "третий"]
    variants = "; ".join(f"{words[i]} — {o.spoken}, врач {short_name(o.doctor_name)}"
                         for i, o in enumerate(s.options))
    return reply(s, f"{note}Есть свободное время: {variants.rstrip('.')}. Какой вариант удобен?",
                  options=s.options)


def pick(s: Session, nl: dict, key: str) -> object | None:
    items = getattr(s, key) or []
    if nl["choice"] and nl["choice"] <= len(items):
        return items[nl["choice"] - 1]
    if len(items) == 1 and nl["answer"] == "yes":
        return items[0]
    return None


async def choose_slot(s: Session, nl: dict, doctors_for_retry) -> ChatResponse | None:
    chosen = None if (nl["date"] or nl["part_of_day"]) else pick(s, nl, "options")
    if chosen:
        s.chosen = chosen
        s.step = "confirm"
        return None
    if nl["date"] or nl["part_of_day"] or nl["answer"] == "no":
        return await offer_slots(s, await doctors_for_retry())
    return reply(s, "Скажите номер варианта: первый, второй или третий. Или назовите другой день.",
                  options=s.options)


async def choose_visit(s: Session, nl: dict, verb: str) -> ChatResponse | None:
    if s.visits is None:
        s.visits = await client_visits(s)
    visits = s.visits
    if not visits:
        return task_done(s, "У вас нет предстоящих записей.", "справка")
    if len(visits) == 1:
        s.visit = visits[0]
        return None
    if s.step == "choose_visit":
        v = pick(s, nl, "visits")
        if v:
            s.visit = v
            return None
    s.step = "choose_visit"
    words = ["первая", "вторая", "третья"]
    items = [visit_booking(v) for v in visits[:3]]
    listing = "; ".join(f"{words[i]} — {b.specialty.lower()}, {b.spoken}" for i, b in enumerate(items))
    return reply(s, f"У вас несколько записей: {listing}. Какую {verb}?", options=items)
