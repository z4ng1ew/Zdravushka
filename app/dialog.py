import uuid
from datetime import date, datetime, timedelta

import httpx

from app import config, journal, knowledge, nlu, safety, schedule
from app.models import Booking, ChatResponse, Escalation
from app.stand_client import StandClient, StandError

GREETING = (f"Здравствуйте! Я {config.ASSISTANT_NAME}, виртуальный помощник регистратуры "
            "поликлиники номер семь. Разговор записывается. Чем могу помочь?")
GOODBYE = "Всего доброго, будьте здоровы!"
ANYTHING_ELSE = "Могу ещё чем-то помочь?"

stand = StandClient() if config.STAND_TOKEN else None

SESSIONS: dict[str, dict] = {}
DEMO_CLIENTS: dict[tuple, dict] = {}
DEMO_VISITS: dict[int, dict] = {}

TASKS = {"booking", "reschedule", "cancel", "status", "schedule_info", "info", "home_visit"}

LABELS = {"specialty": "специальность", "last_name": "фамилия", "first_name": "имя",
          "middle_name": "отчество", "birth_date": "дата рождения", "date": "желаемая дата",
          "part_of_day": "время дня", "doctor_name": "врач", "address": "адрес", "reason": "повод"}


class StandDown(Exception):
    pass


def _collected(s: dict) -> dict:
    return {LABELS[k]: v for k, v in s["c"].items() if k in LABELS and v}


def _reply(s: dict, text: str, **kw) -> ChatResponse:
    journal.say(s["call"], "bot", text)
    if kw.get("done"):
        s["step"] = "done"
    journal.save()
    return ChatResponse(session_id=s["id"], reply=text, intent=s.get("task") or s.get("last_task"),
                        collected=_collected(s), **kw)


def _finish(s: dict) -> ChatResponse:
    return _reply(s, GOODBYE, done=True)


def _escalate(s: dict, esc: Escalation) -> ChatResponse:
    c = s["c"]
    who = journal.mask_name(c.get("last_name"), c.get("first_name"), c.get("middle_name"))
    esc.summary = f"{esc.summary}. Пациент: {who or 'не назван'}. Задача: {s.get('task') or '—'}."
    journal.handoff(s["call"], esc.reason, esc.priority == "P1", esc.summary, _collected(s))
    s["call"]["result"] = "переведён"
    s["call"]["intent"] = s["call"]["intent"] or "перевод на регистратора"
    s["task"] = "escalation"
    return _reply(s, safety.PHRASES.get(esc.rule, safety.PHRASES["R-08"]), escalation=esc, done=True)


def _task_done(s: dict, text: str, result: str, **kw) -> ChatResponse:
    s["call"]["result"] = result
    s["last_task"], s["task"], s["step"] = s["task"], None, "more"
    for key in ("options", "visits", "visit", "chosen"):
        s.pop(key, None)
    return _reply(s, f"{text} {ANYTHING_ELSE}", **kw)


async def _mis(s: dict, method: str, path: str, coro):
    try:
        result = await coro
    except StandError as e:
        journal.stand_request(s["call"], method, path, e.status, e.message)
        raise StandDown(e.message) from e
    except httpx.HTTPError as e:
        journal.stand_request(s["call"], method, path, 0, "нет ответа")
        raise StandDown(str(e)) from e
    journal.stand_request(s["call"], method, path, 201 if method == "POST" else 200)
    return result


async def _doctors(specialty: str) -> list[dict]:
    if stand:
        docs = await stand.active_doctors(specialty)
    else:
        docs = [d for d in schedule.demo_doctors() if d["specialty"].lower() == specialty.lower()]
    return [d for d in docs if schedule.excel_doctor(d["full_name"])]


async def _busy(s: dict) -> set[tuple[int, str]]:
    today = schedule.now().date()
    if stand:
        visits = await _mis(s, "GET", "/visits", stand.list_visits(
            status="Запланирована", date_from=today.strftime("%d.%m.%Y"),
            date_to=(today + timedelta(days=45)).strftime("%d.%m.%Y")))
    else:
        visits = [v for v in DEMO_VISITS.values() if v["status"] == "Запланирована"]
    return {(v["doctor"]["id"], v["scheduled_at"]) for v in visits}


async def _identify(s: dict) -> dict:
    c = s["c"]
    if stand:
        client = await _mis(s, "GET", "/clients", stand.find_client(
            c["last_name"], c["first_name"], c["birth_date"]))
        if not client:
            client = await _mis(s, "POST", "/clients", stand.create_client(
                c["last_name"], c["first_name"], c["birth_date"], c.get("middle_name"),
                comment="Карточка заведена голосовым ассистентом"))
    else:
        key = (c["last_name"].lower(), c["first_name"].lower(), c["birth_date"])
        client = DEMO_CLIENTS.setdefault(key, {"id": len(DEMO_CLIENTS) + 1, "last_name": c["last_name"],
                                               "first_name": c["first_name"], "birth_date": c["birth_date"],
                                               "comment": None})
    s["client"] = client
    s["call"]["patient"] = journal.mask_name(c["last_name"], c["first_name"], c.get("middle_name"))
    return client


async def _client_visits(s: dict) -> list[dict]:
    cid = s["client"]["id"]
    if stand:
        visits = await _mis(s, "GET", "/visits", stand.list_visits(client_id=cid, status="Запланирована"))
    else:
        visits = [v for v in DEMO_VISITS.values() if v["client_id"] == cid and v["status"] == "Запланирована"]
    now = schedule.now()
    return sorted([v for v in visits if schedule.from_api(v["scheduled_at"]) > now],
                  key=lambda v: schedule.from_api(v["scheduled_at"]))


async def _create_visit(s: dict, o: Booking) -> dict:
    if stand:
        return await _mis(s, "POST", "/visits", stand.create_visit(s["client"]["id"], o.doctor_id, o.scheduled_at))
    vid = len(DEMO_VISITS) + 1
    DEMO_VISITS[vid] = {"id": vid, "client_id": s["client"]["id"], "scheduled_at": o.scheduled_at,
                        "status": "Запланирована",
                        "doctor": {"id": o.doctor_id, "full_name": o.doctor_name, "specialty": o.specialty}}
    return DEMO_VISITS[vid]


async def _reschedule_visit(s: dict, visit: dict, o: Booking) -> dict:
    if stand:
        return await _mis(s, "PATCH", f"/visits/{visit['id']}",
                          stand.reschedule_visit(visit["id"], o.scheduled_at))
    DEMO_VISITS[visit["id"]]["scheduled_at"] = o.scheduled_at
    return DEMO_VISITS[visit["id"]]


async def _cancel_visit(s: dict, visit: dict) -> dict:
    if stand:
        return await _mis(s, "PATCH", f"/visits/{visit['id']}", stand.cancel_visit(visit["id"]))
    DEMO_VISITS[visit["id"]]["status"] = "Отменена"
    return DEMO_VISITS[visit["id"]]


def _short(name: str) -> str:
    parts = name.split()
    return " ".join([parts[0]] + [f"{p[0]}." for p in parts[1:]])


def _room(name: str) -> str:
    doc = schedule.excel_doctor(name) or {}
    return f", кабинет {doc['cabinet']}" if doc.get("cabinet") else ""


def _booking(doc: dict, slot: datetime) -> Booking:
    return Booking(doctor_id=doc["id"], doctor_name=doc["full_name"], specialty=doc["specialty"],
                   scheduled_at=schedule.to_api(slot), spoken=schedule.say_slot(slot))


def _visit_booking(v: dict) -> Booking:
    dt = schedule.from_api(v["scheduled_at"])
    return Booking(visit_id=v["id"], doctor_id=v["doctor"]["id"], doctor_name=v["doctor"]["full_name"],
                   specialty=v["doctor"]["specialty"], scheduled_at=v["scheduled_at"],
                   spoken=schedule.say_slot(dt), status=v["status"])


async def _need_identity(s: dict) -> ChatResponse | None:
    if s.get("client"):
        return None
    c = s["c"]
    if not (c.get("last_name") and c.get("first_name")):
        s["step"] = "identity"
        return _reply(s, "Назовите, пожалуйста, фамилию, имя, отчество и дату рождения пациента.")
    if not c.get("birth_date"):
        s["step"] = "birth_date"
        return _reply(s, "Назовите дату рождения пациента.")
    await _identify(s)
    return None


async def _offer_slots(s: dict, doctors: list[dict], exclude: str | None = None) -> ChatResponse:
    c = s["c"]
    busy = await _busy(s)
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
        return _escalate(s, Escalation(rule="R-08", reason="лист ожидания", priority="P3",
                                       summary="Нет свободного времени в ближайший месяц — лист ожидания"))
    s["options"] = [_booking(d, t) for d, t in found]
    s["step"] = "choose_slot"
    words = ["первый", "второй", "третий"]
    variants = "; ".join(f"{words[i]} — {o.spoken}, врач {_short(o.doctor_name)}"
                         for i, o in enumerate(s["options"]))
    return _reply(s, f"{note}Есть свободное время: {variants.rstrip('.')}. Какой вариант удобен?",
                  options=s["options"])


def _pick(s: dict, nl: dict, key: str) -> object | None:
    items = s.get(key) or []
    if nl["choice"] and nl["choice"] <= len(items):
        return items[nl["choice"] - 1]
    if len(items) == 1 and nl["answer"] == "yes":
        return items[0]
    return None


async def _choose_slot(s: dict, nl: dict, doctors_for_retry) -> ChatResponse | None:
    chosen = _pick(s, nl, "options")
    if chosen:
        s["chosen"] = chosen
        s["step"] = "confirm"
        return None
    if nl["date"] or nl["part_of_day"] or nl["answer"] == "no":
        return await _offer_slots(s, await doctors_for_retry())
    return _reply(s, "Скажите номер варианта: первый, второй или третий. Или назовите другой день.",
                  options=s["options"])


async def _choose_visit(s: dict, nl: dict, verb: str) -> ChatResponse | None:
    if "visits" not in s:
        s["visits"] = await _client_visits(s)
    visits = s["visits"]
    if not visits:
        return _task_done(s, "У вас нет предстоящих записей.", "справка")
    if len(visits) == 1:
        s["visit"] = visits[0]
        return None
    if s["step"] == "choose_visit":
        v = _pick(s, nl, "visits")
        if v:
            s["visit"] = v
            return None
    s["step"] = "choose_visit"
    words = ["первая", "вторая", "третья"]
    items = [_visit_booking(v) for v in visits[:3]]
    listing = "; ".join(f"{words[i]} — {b.specialty.lower()}, {b.spoken}" for i, b in enumerate(items))
    return _reply(s, f"У вас несколько записей: {listing}. Какую {verb}?", options=items)


async def task_booking(s: dict, nl: dict) -> ChatResponse:
    c = s["c"]
    s["call"]["intent"] = "Запись к врачу"
    if not c.get("specialty"):
        s["step"] = "specialty"
        return _reply(s, "К какому врачу вас записать?")
    doctors = await _doctors(c["specialty"])
    if not doctors:
        c.pop("specialty")
        s["step"] = "specialty"
        return _reply(s, "К такому специалисту записать не могу. Назовите другого врача, например терапевта.")
    if (r := await _need_identity(s)):
        return r

    if s["step"] == "choose_slot":
        if (r := await _choose_slot(s, nl, lambda: _doctors(c["specialty"]))):
            return r
    elif s["step"] == "confirm":
        if nl["answer"] == "yes":
            o = s["chosen"]
            busy = await _busy(s)
            doc = next(d for d in doctors if d["id"] == o.doctor_id)
            if (o.doctor_id, o.scheduled_at) in busy or not schedule.is_valid_slot(doc, schedule.from_api(o.scheduled_at)):
                return await _offer_slots(s, doctors)
            visit = await _create_visit(s, o)
            done = o.model_copy(update={"visit_id": visit["id"], "status": "Запланирована"})
            return _task_done(s, f"Готово, вы записаны {o.spoken}{_room(o.doctor_name)}. "
                                 "Возьмите паспорт и полис ОМС.", "записан", booking=done)
        if nl["answer"] == "no" or nl["date"] or nl["part_of_day"]:
            return await _offer_slots(s, doctors)
        return _reply(s, "Подтвердите, пожалуйста: записываю? Скажите «да» или «нет».", booking=s["chosen"])
    else:
        return await _offer_slots(s, doctors)

    o = s["chosen"]
    return _reply(s, f"Записываю: {o.specialty.lower()}, врач {o.doctor_name}, {o.spoken}{_room(o.doctor_name)}. Верно?",
                  booking=o)


async def task_reschedule(s: dict, nl: dict) -> ChatResponse:
    s["call"]["intent"] = "Перенос записи"
    if (r := await _need_identity(s)):
        return r
    if not s.get("visit") and (r := await _choose_visit(s, nl, "перенести")):
        return r
    visit = s["visit"]
    doctor = visit["doctor"]

    async def same_doctor():
        return [doctor]

    if s["step"] == "choose_slot":
        if (r := await _choose_slot(s, nl, same_doctor)):
            return r
    elif s["step"] == "confirm":
        if nl["answer"] == "yes":
            o = s["chosen"]
            if (o.doctor_id, o.scheduled_at) in await _busy(s):
                return await _offer_slots(s, [doctor], exclude=(doctor["id"], visit["scheduled_at"]))
            updated = await _reschedule_visit(s, visit, o)
            return _task_done(s, f"Готово, запись перенесена. Новое время: {o.spoken}{_room(o.doctor_name)}.", "перенесён",
                              booking=_visit_booking(updated))
        if nl["answer"] == "no" or nl["date"] or nl["part_of_day"]:
            return await _offer_slots(s, [doctor], exclude=(doctor["id"], visit["scheduled_at"]))
        return _reply(s, "Подтвердите перенос: да или нет?", booking=s["chosen"])
    else:
        return await _offer_slots(s, [doctor], exclude=(doctor["id"], visit["scheduled_at"]))

    o = s["chosen"]
    old = schedule.say_slot(schedule.from_api(visit["scheduled_at"]))
    return _reply(s, f"Переношу запись, врач {_short(o.doctor_name)}. Было: {old}. Станет: {o.spoken}. Верно?",
                  booking=o)


async def task_cancel(s: dict, nl: dict) -> ChatResponse:
    s["call"]["intent"] = "Отмена записи"
    if (r := await _need_identity(s)):
        return r
    if not s.get("visit") and (r := await _choose_visit(s, nl, "отменить")):
        return r
    b = _visit_booking(s["visit"])
    if s["step"] == "confirm":
        if nl["answer"] == "yes":
            updated = await _cancel_visit(s, s["visit"])
            return _task_done(s, "Запись отменена. Спасибо, что предупредили.", "отменён",
                              booking=_visit_booking(updated))
        if nl["answer"] == "no":
            return _task_done(s, "Хорошо, запись остаётся.", "справка")
    s["step"] = "confirm"
    return _reply(s, f"Отменяю запись: {b.specialty.lower()}, врач {b.doctor_name}, {b.spoken}. Верно?", booking=b)


async def task_status(s: dict, nl: dict) -> ChatResponse:
    s["call"]["intent"] = "Статус записи"
    if (r := await _need_identity(s)):
        return r
    visits = await _client_visits(s)
    if not visits:
        return _task_done(s, "У вас нет предстоящих записей.", "справка")
    items = [_visit_booking(v) for v in visits[:3]]
    text = "; ".join(f"{b.specialty.lower()}, врач {b.doctor_name}, {b.spoken}{_room(b.doctor_name)}" for b in items)
    return _task_done(s, f"Вы записаны: {text}.", "справка", options=items)


async def task_schedule_info(s: dict, nl: dict) -> ChatResponse:
    c = s["c"]
    s["call"]["intent"] = "График врача"
    docs = []
    if c.get("doctor_name"):
        last = c["doctor_name"].split()[0].lower()
        docs = [d for d in schedule.demo_doctors() if d["full_name"].lower().startswith(last)]
    elif c.get("specialty"):
        docs = [d for d in schedule.demo_doctors() if d["specialty"] == c["specialty"]][:3]
    if not docs:
        s["step"] = "specialty"
        return _reply(s, "Какой врач вас интересует? Назовите фамилию или специальность.")
    lines = [f"{d['full_name']}: {schedule.weekly_text(d['full_name'])}" for d in docs[:3]]
    return _task_done(s, "График приёма. " + "; ".join(lines) + ". Записать вас?", "справка")


async def task_info(s: dict, nl: dict) -> ChatResponse:
    s["call"]["intent"] = "Справка"
    text = knowledge.answer(nl["topic"])
    if not text:
        return _escalate(s, Escalation(rule="R-08", reason="не распознано", priority="P3",
                                       summary="Справочный вопрос вне базы знаний"))
    return _task_done(s, text, "справка")


async def task_home_visit(s: dict, nl: dict) -> ChatResponse:
    c = s["c"]
    s["call"]["intent"] = "Вызов врача на дом"
    now = schedule.now()
    if now.weekday() == 6:
        return _task_done(s, "В воскресенье заявки на дом не принимаются. Если состояние ухудшится — звоните сто три.",
                          "справка")
    if not s.get("warned"):
        s["warned"] = True
        if not (c.get("last_name") and c.get("birth_date")):
            s["step"] = "identity"
            return _reply(s, "Хорошо. Если сейчас сильная боль в груди, трудно дышать или человек теряет сознание — "
                             "звоните сто три. Если нет, назовите фамилию, имя, отчество и дату рождения пациента.")
    if (r := await _need_identity(s)):
        return r
    if not c.get("address"):
        s["step"] = "address"
        return _reply(s, "Назовите адрес, куда должен прийти врач.")
    if not c.get("reason"):
        s["step"] = "reason"
        return _reply(s, "Коротко скажите своими словами, что случилось. Я передам врачу.")

    limit = 12 if now.weekday() == 5 else 14
    day = now.date() if now.hour < limit else now.date() + timedelta(days=1)
    while day.weekday() == 6 or day in schedule.HOLIDAYS:
        day += timedelta(days=1)
    birth = datetime.strptime(c["birth_date"], "%d.%m.%Y").date()
    child = (now.date() - birth).days < 18 * 365
    specialty = "Педиатр" if child else "Терапевт"
    doctors = await _doctors(specialty)
    slot = schedule.find_free_slots(doctors, await _busy(s), date_from=day, date_to=day + timedelta(days=2), limit=1)
    if not slot:
        return _escalate(s, Escalation(rule="R-08", reason="вызов на дом", priority="P2",
                                       summary=f"Вызов на дом, нет врача в графике. Адрес: {c['address']}"))
    doc, when = slot[0]
    o = _booking(doc, when)
    visit = await _create_visit(s, o)
    note = f"ВЫЗОВ НА ДОМ {day.strftime('%d.%m.%Y')}. Адрес: {c['address']}. Повод: {c['reason']}"
    if stand:
        await _mis(s, "PATCH", f"/clients/{s['client']['id']}",
                   stand.update_client_comment(s["client"]["id"], note))
    journal.handoff(s["call"], "вызов на дом", False, f"Заявка требует подтверждения. {note}", _collected(s))
    when_text = "сегодня" if day == now.date() else schedule.say_date(day)
    return _task_done(s, f"Заявка принята на {when_text}. Врач придёт до восемнадцати часов, точное время "
                         "назвать не могу. Регистратор проверит заявку.", "записан",
                      booking=o.model_copy(update={"visit_id": visit["id"], "status": "Запланирована"}))


HANDLERS = {"booking": task_booking, "reschedule": task_reschedule, "cancel": task_cancel,
            "status": task_status, "schedule_info": task_schedule_info, "info": task_info,
            "home_visit": task_home_visit}


async def handle(session_id: str | None, text: str) -> ChatResponse:
    if not session_id or session_id not in SESSIONS:
        session_id = session_id or uuid.uuid4().hex[:12]
        SESSIONS[session_id] = {"id": session_id, "step": "start", "task": None, "c": {}, "miss": 0,
                                "call": journal.start_call(session_id)}
        if not text.strip():
            return _reply(SESSIONS[session_id], GREETING)
    s = SESSIONS[session_id]
    text = text.strip()
    if s["step"] == "done":
        return ChatResponse(session_id=session_id, reply="Разговор завершён. Чтобы начать заново, позвоните ещё раз.",
                            done=True, collected=_collected(s))
    if not text:
        return _reply(s, "Вы меня слышите?")
    journal.say(s["call"], "patient", text)

    if (esc := safety.check(text)):
        return _escalate(s, esc)

    nl = await nlu.understand(text, s["step"])
    intent = nl["intent"]
    if s["step"] == "reason":
        nl["reason"] = nl["reason"] or text
        if intent in ("medical", "other", None):
            intent = "other"
    if s["step"] == "address" and not nl["address"]:
        nl["address"] = text
    if intent == "emergency":
        return _escalate(s, Escalation(rule="R-01", reason="неотложное состояние", priority="P1",
                                       emergency=True, summary=f"Возможная угроза жизни: «{text}»"))
    if intent == "operator":
        return _escalate(s, Escalation(rule="R-02", reason="просьба оператора", priority="P2",
                                       summary="Пациент попросил сотрудника"))
    if intent == "complaint":
        return _escalate(s, Escalation(rule="R-03", reason="жалоба", priority="P2", summary=f"Жалоба: «{text}»"))
    if intent == "medical":
        if s.get("medical_warned"):
            return _escalate(s, Escalation(rule="R-04", reason="медицинский вопрос", priority="P3",
                                           summary=f"Медицинский вопрос: «{text}»"))
        s["medical_warned"] = True
        return _reply(s, "Я не могу давать медицинские советы — это может сделать только врач. "
                         "Давайте я запишу вас на приём к терапевту. Если состояние резко ухудшилось, звоните сто три.")
    if s["step"] == "more" and (intent == "goodbye" or (nl["answer"] == "no" and intent not in TASKS)):
        return _finish(s)
    if intent == "goodbye" and not s.get("task"):
        return _finish(s)

    if intent in TASKS and (not s.get("task") or s["step"] in ("start", "more", "specialty")):
        if intent != s.get("task") or s["step"] == "more":
            for key in ("options", "visits", "visit", "chosen"):
                s.pop(key, None)
            for key in ("specialty", "doctor_name", "date", "part_of_day", "address", "reason"):
                s["c"].pop(key, None)
        s["task"] = intent
        if s["step"] in ("start", "more"):
            s["step"] = "start"

    for key in ("specialty", "doctor_name", "last_name", "first_name", "middle_name", "birth_date",
                "date", "part_of_day", "address", "reason"):
        if nl[key]:
            s["c"][key] = nl[key]
    if not s.get("task"):
        if s["step"] == "specialty" and nl["specialty"]:
            s["task"] = "booking"
        else:
            s["miss"] += 1
            if s["miss"] >= 3:
                return _escalate(s, Escalation(rule="R-05", reason="не распознано", priority="P3",
                                               summary="Ассистент трижды не понял пациента"))
            if s["miss"] == 2:
                return _reply(s, "Простите, не поняла. Могу соединить с сотрудником, или скажите иначе: "
                                 "записаться, перенести или отменить запись?")
            return _reply(s, "Я могу записать к врачу, перенести или отменить запись, вызвать врача на дом "
                             "или подсказать график. Что нужно?")
    s["miss"] = 0

    try:
        return await HANDLERS[s["task"]](s, nl)
    except StandDown as e:
        return _escalate(s, Escalation(rule="R-06", reason="не распознано", priority="P3",
                                       summary=f"Сбой МИС: {e}"))
