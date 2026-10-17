import json

import httpx
import pytest

from app import config, dialog, schedule
from app.stand_client import StandClient


class FakeStand:

    def __init__(self, broken: bool = False):
        self.broken = broken
        self.doctors = [{"id": 100 + i, "full_name": d["full_name"], "specialty": d["specialty"], "is_active": True}
                        for i, d in enumerate(schedule.demo_doctors())]
        self.clients, self.visits, self.escalations = [], [], []

    def __call__(self, req: httpx.Request) -> httpx.Response:
        if self.broken:
            return httpx.Response(500, json={"code": "ВНУТРЕННЯЯ_ОШИБКА", "message": "сбой"})
        path, q = req.url.path.replace("/api/v1", ""), dict(req.url.params)
        body = json.loads(req.content) if req.content else {}
        if path == "/doctors":
            o = int(q["offset"])
            return httpx.Response(200, json=self.doctors[o:o + 50])
        if path == "/clients" and req.method == "GET":
            found = [c for c in self.clients if c["last_name"] == q.get("last_name")
                     and c["first_name"] == q.get("first_name") and c["birth_date"] == q.get("birth_date")]
            return httpx.Response(200, json=found)
        if path == "/clients" and req.method == "POST":
            for c in self.clients:
                if (c["last_name"], c["first_name"], c["birth_date"]) == (body["last_name"], body["first_name"], body["birth_date"]):
                    return httpx.Response(200, json=c)
            c = {"id": len(self.clients) + 1, "comment": None, **body}
            self.clients.append(c)
            return httpx.Response(201, json=c)
        if path.startswith("/clients/"):
            c = self.clients[int(path.split("/")[-1]) - 1]
            c.update(body)
            return httpx.Response(200, json=c)
        if path == "/visits" and req.method == "POST":
            doc = next(d for d in self.doctors if d["id"] == body["doctor_id"])
            v = {"id": len(self.visits) + 1, "client_id": body["client_id"], "doctor": doc,
                 "scheduled_at": body["scheduled_at"], "status": "Запланирована"}
            self.visits.append(v)
            return httpx.Response(201, json=v)
        if path == "/visits":
            res = [v for v in self.visits
                   if (not q.get("client_id") or str(v["client_id"]) == q["client_id"])
                   and (not q.get("status") or v["status"] == q["status"])]
            return httpx.Response(200, json=res if int(q.get("offset", 0)) == 0 else [])
        if path.startswith("/visits/"):
            v = self.visits[int(path.split("/")[-1]) - 1]
            if v["status"] != "Запланирована":
                return httpx.Response(409, json={"code": "КОНФЛИКТ_СТАТУСА", "message": "нельзя"})
            v.update(body)
            return httpx.Response(200, json=v)
        if path == "/escalations":
            e = {"id": len(self.escalations) + 1, **body}
            self.escalations.append(e)
            return httpx.Response(201, json=e)
        return httpx.Response(404, json={"code": "НЕ_НАЙДЕНО", "message": path})


@pytest.fixture
def mis(monkeypatch):
    fake = FakeStand()
    monkeypatch.setattr(config, "STAND_RATE_LIMIT", 1000)
    monkeypatch.setattr(config, "LLM_URL", "")
    client = StandClient(base_url="https://stand/api/v1", token="t", transport=httpx.MockTransport(fake))
    monkeypatch.setattr(dialog, "stand", client)
    dialog.SESSIONS.clear()
    return fake


async def talk(*phrases: str):
    r = await dialog.handle(None, "")
    for p in phrases:
        r = await dialog.handle(r.session_id, p)
    return r


async def test_booking_creates_visit(mis):
    r = await talk("запишите к терапевту", "Козлов Андрей 10.10.1990", "1", "да")
    assert "записаны" in r.reply and len(mis.visits) == 1
    assert mis.clients[0]["last_name"] == "Козлов"


async def test_existing_patient_not_duplicated(mis):
    await talk("запишите к терапевту", "Козлов Андрей 10.10.1990", "1", "да")
    await talk("запишите к окулисту", "козлов андрей 10.10.1990", "1", "да")
    assert len(mis.clients) == 1 and len(mis.visits) == 2


async def test_no_double_booking_same_slot(mis):
    await talk("запишите к терапевту", "Козлов Андрей 10.10.1990", "1", "да")
    await talk("запишите к терапевту", "Петров Пётр 01.01.1980", "1", "да")
    slots = {(v["doctor"]["id"], v["scheduled_at"]) for v in mis.visits}
    assert len(slots) == len(mis.visits) == 2


async def test_reschedule_and_cancel(mis):
    await talk("запишите к терапевту", "Козлов Андрей 10.10.1990", "1", "да")
    old = mis.visits[0]["scheduled_at"]
    await talk("перенести запись", "Козлов Андрей 10.10.1990", "2", "да")
    assert mis.visits[0]["scheduled_at"] != old
    r = await talk("отменить запись", "Козлов Андрей 10.10.1990", "да")
    assert mis.visits[0]["status"] == "Отменена" and "отменена" in r.reply


async def test_status_without_visits(mis):
    r = await talk("когда я записан", "Новиков Олег 02.02.1975")
    assert "нет предстоящих" in r.reply


async def test_patient_says_no_on_confirm(mis):
    r = await talk("запишите к терапевту", "Козлов Андрей 10.10.1990", "1", "нет")
    assert "Есть свободное время" in r.reply and not mis.visits


async def test_emergency_without_identity_uses_tech_client(mis):
    r = await talk("у меня болит грудь")
    assert r.escalation.rule == "R-01" and r.escalation.emergency and r.done
    assert "сто три" in r.reply
    assert mis.escalations and mis.clients[0]["last_name"] == "Срочный"


async def test_emergency_mid_booking_stops_booking(mis):
    r = await talk("запишите к терапевту", "Козлов Андрей 10.10.1990", "мужу плохо, потерял сознание")
    assert r.escalation.rule == "R-01" and not mis.visits
    assert mis.escalations[0]["client_id"] == mis.clients[0]["id"]


async def test_operator_request(mis):
    r = await talk("соедините с оператором")
    assert r.escalation.rule == "R-02" and mis.escalations


async def test_complaint(mis):
    r = await talk("хочу пожаловаться на врача")
    assert r.escalation.rule == "R-03"


async def test_medical_question_never_answered(mis):
    r = await talk("что выпить от давления")
    assert "не могу давать медицинские советы" in r.reply or r.escalation


async def test_hard_of_hearing_repeat_then_operator(mis):
    r = await talk("запишите к терапевту", "не расслышал, повторите")
    assert r.reply.startswith("Повторяю")
    r = await dialog.handle(r.session_id, "не слышу, громче")
    assert r.escalation and r.escalation.rule == "R-15"


async def test_three_misunderstandings_go_to_operator(mis):
    r = await talk("ыыы", "ааа", "ммм")
    assert r.escalation.rule == "R-05"


async def test_stand_down_goes_to_operator(mis):
    mis.broken = True
    r = await talk("запишите к терапевту")
    assert r.escalation and r.escalation.rule == "R-06" and r.done


async def test_home_visit_creates_request_with_address(mis):
    r = await talk("вызвать врача на дом", "Сидоров Семён 05.05.1950", "улица Лесная 12 кв 40",
                   "с утра болит голова и температура")
    if schedule.now().weekday() == 6:
        pytest.skip("в воскресенье заявки на дом не принимаются")
    assert mis.escalations and "Лесная 12" in mis.escalations[-1]["description"]
    assert "температура" in mis.escalations[-1]["description"] and not r.escalation


async def test_home_visit_child_goes_to_pediatrician(mis):
    if schedule.now().weekday() == 6:
        pytest.skip("воскресенье")
    await talk("врача на дом ребёнку", "Сидорова Аня 05.05.2020", "Лесная 12", "температура")
    assert "педиатр" in mis.escalations[-1]["description"]


async def test_heart_pain_is_emergency(mis):
    r = await talk("запишите к терапевту", "Козлов Андрей 10.10.1990", "у меня болит сердце")
    assert r.escalation and r.escalation.emergency and not mis.visits


async def test_named_date_beats_option_number(mis):
    r = await dialog.handle(None, "")
    for p in ("запишите к терапевту", "Козлов Андрей 10.10.1990"):
        r = await dialog.handle(r.session_id, p)
    day = (schedule.now().date() + __import__("datetime").timedelta(days=12)).strftime("%d.%m.%Y")
    r = await dialog.handle(r.session_id, day)
    assert "Есть свободное время" in r.reply or "нет" in r.reply.lower()
    assert not r.booking or r.options


async def test_booking_with_named_doctor(mis):
    await talk("запишите к Дорохову", "Козлов Андрей 10.10.1990", "1", "да")
    assert mis.visits and mis.visits[0]["doctor"]["full_name"].startswith("Дорохов")


async def test_reschedule_to_other_doctor_books_new_and_cancels_old(mis):
    await talk("запишите к Богдановой", "Козлов Андрей 10.10.1990", "1", "да")
    r = await talk("перенести запись к Дорохову", "Козлов Андрей 10.10.1990", "1", "да")
    assert "Прежняя запись отменена" in r.reply
    assert mis.visits[0]["status"] == "Отменена"
    assert mis.visits[1]["doctor"]["full_name"].startswith("Дорохов")


def test_whisper_hallucination_filtered():
    from app import ai
    assert ai.is_hallucination("Продолжение следует...")
    assert not ai.is_hallucination("Запишите к терапевту")


async def test_which_doctors_lists_specialties(mis):
    r = await talk("запишите меня", "а какие есть врачи?")
    assert "терапевт" in r.reply and "Центральной" not in r.reply


async def test_only_year_asks_full_birth_date(mis):
    r = await talk("запишите к терапевту", "Козлов Андрей", "1985 год")
    assert "число, месяц и год" in r.reply
    r = await dialog.handle(r.session_id, "10.10.1985")
    assert "Есть свободное время" in r.reply


async def test_sudden_severe_headache_is_emergency(mis):
    r = await talk("У меня резко, очень сильно заболела голова. Я не знаю, что делать.")
    assert r.escalation and r.escalation.emergency


def test_severe_pain_words():
    from app import safety
    assert safety.check("очень сильно болит живот").rule == "R-11"
    assert safety.check("болит горло") is None
