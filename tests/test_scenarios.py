import httpx
import pytest

from app import config, dialog, schedule
from app.mock_stand import MockStand as FakeStand
from app.stand_client import StandClient


@pytest.fixture
def mis(monkeypatch):
    fake = FakeStand()
    monkeypatch.setattr(config, "STAND_RATE_LIMIT", 1000)
    monkeypatch.setattr(config, "LLM_URL", "")
    client = StandClient(base_url="https://stand/api/v1", token="t", transport=httpx.MockTransport(fake))
    monkeypatch.setattr(dialog.state, "stand", client)
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


async def _booked(mis):
    await talk("запишите к терапевту", "Козлов Андрей 10.10.1990", "1", "да")
    return mis.visits[0]


async def test_reminder_confirmed(mis):
    v = await _booked(mis)
    r = dialog.start_reminder("rem1", v)
    assert "Вы придёте" in r.reply
    r = await dialog.handle("rem1", "да, приду")
    assert r.done and "ждём вас" in r.reply
    assert dialog.journal.REMINDERS[v["id"]]["status"] == "подтвердил"
    assert "Подтвердил" in mis.clients[0]["comment"]


async def test_reminder_cancel(mis):
    v = await _booked(mis)
    dialog.start_reminder("rem2", v)
    r = await dialog.handle("rem2", "нет, не смогу")
    assert "Отменить" in r.reply
    r = await dialog.handle("rem2", "отмените")
    assert r.done and mis.visits[0]["status"] == "Отменена"
    assert dialog.journal.REMINDERS[v["id"]]["status"] == "отменил"


async def test_reminder_reschedule(mis):
    v = await _booked(mis)
    old = v["scheduled_at"]
    dialog.start_reminder("rem3", v)
    r = await dialog.handle("rem3", "перенесите, пожалуйста")
    assert "Есть свободное время" in r.reply
    await dialog.handle("rem3", "1")
    r = await dialog.handle("rem3", "да")
    assert "перенесена" in r.reply and mis.visits[0]["scheduled_at"] != old
    assert dialog.journal.REMINDERS[v["id"]]["status"] == "перенёс"


async def test_reminder_emergency_still_works(mis):
    v = await _booked(mis)
    dialog.start_reminder("rem4", v)
    r = await dialog.handle("rem4", "мне плохо, болит сердце")
    assert r.escalation and r.escalation.emergency


async def test_cancel_both_visits(mis):
    await talk("запишите к терапевту", "Козлов Андрей 10.10.1990", "1", "да")
    await talk("запишите к окулисту", "Козлов Андрей 10.10.1990", "1", "да")
    r = await talk("отмените запись", "Козлов Андрей 10.10.1990", "обе отмените")
    assert "Отменила все записи: 2" in r.reply
    assert all(v["status"] == "Отменена" for v in mis.visits)


async def test_reminder_cancel_other_visit_keeps_status_correct(mis):
    await talk("запишите к терапевту", "Козлов Андрей 10.10.1990", "1", "да")
    await talk("запишите к окулисту", "Козлов Андрей 10.10.1990", "1", "да")
    v1, v2 = mis.visits
    dialog.journal.REMINDERS.clear()
    dialog.start_reminder("rem5", v1)
    await dialog.handle("rem5", "да")
    assert dialog.journal.REMINDERS[v1["id"]]["status"] == "подтвердил"


async def test_no_stand_means_operator_not_fake_booking(monkeypatch):
    monkeypatch.setattr(config, "LLM_URL", "")
    monkeypatch.setattr(dialog.state, "stand", None)
    dialog.SESSIONS.clear()
    r = await talk("запишите к терапевту")
    assert r.escalation and r.escalation.rule == "R-06" and r.status == "handoff"


async def test_mock_stand_adapter_end_to_end(monkeypatch):
    from app import mock_stand
    fake = mock_stand.MockStand()
    monkeypatch.setattr(config, "LLM_URL", "")
    monkeypatch.setattr(dialog.state, "stand", mock_stand.client(fake))
    dialog.SESSIONS.clear()
    r = await talk("запишите к терапевту", "Козлов Андрей 10.10.1990", "1", "да")
    assert r.status == "completed" and r.source == "МИС" and len(fake.visits) == 1


async def test_llm_garbage_falls_back_to_keywords(monkeypatch, mis):
    from app import ai, nlu
    monkeypatch.setattr(config, "LLM_URL", "http://127.0.0.1:1/v1")

    async def broken(*a, **kw):
        return httpx.Response(200, json={"choices": [{"message": {"content": None}}]})
    monkeypatch.setattr(ai, "_post", broken)
    nl = await nlu.understand("запишите к терапевту", "start")
    assert nl["intent"] == "booking" and nl["specialty"] == "Терапевт"


async def test_stt_timeout_is_ai_error(monkeypatch):
    from app import ai
    monkeypatch.setattr(config, "STT_URL", "http://127.0.0.1:1/v1")

    async def timeout(*a, **kw):
        raise httpx.ReadTimeout("slow")

    class Client:
        def __init__(self, *a, **kw): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *a): pass
        post = timeout
    monkeypatch.setattr(ai.httpx, "AsyncClient", Client)
    with pytest.raises(ai.AIError):
        await ai.speech_to_text(b"x")


def test_untrusted_ai_host_rejected():
    assert config._trusted("https://api.some-free-stt.com/v1") == ""
    assert config._trusted("https://hub.gigaschool.ru/api/v1/llm/v1")
    assert config._trusted("http://10.0.0.5:8000/v1")


def test_knowledge_detects_topics():
    from app import knowledge
    assert knowledge.detect("Готовы ли мои анализы?") == "test_results"
    assert knowledge.detect("До скольки вы работаете?") == "hours"
    assert knowledge.detect("Как к вам проехать?") == "address"


async def test_info_question_answered_from_regulation(mis):
    r = await talk("скажите, до скольки вы работаете?")
    assert "по будням" in r.reply and r.source == "регламент РГ-ТЕЛ-01"


async def test_personal_data_hidden_in_transcript(mis):
    r = await talk("запишите к терапевту", "Козлов Андрей 10.10.1990")
    texts = [x["text"] for x in dialog.journal.CALLS[r.session_id]["transcript"]]
    assert not any("Козлов" in x or "10.10.1990" in x for x in texts)


def test_journal_save_survives_disk_error(monkeypatch, tmp_path):
    from app import journal
    (tmp_path / "busy").write_text("файл, а не папка")
    monkeypatch.setattr(journal, "FILE", tmp_path / "busy" / "j.json")
    journal.save()
