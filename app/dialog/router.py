import re
import uuid

import httpx

from app import journal, nlu, safety
from app.dialog.booking import task_booking
from app.dialog.common import GREETING, collected, escalate, finish, reply
from app.dialog.info import task_home_visit, task_info, task_schedule_info
from app.dialog.reminder import task_reminder
from app.dialog.state import SESSIONS, TASKS, StandDown
from app.dialog.visits import task_cancel, task_reschedule, task_status
from app.models import ChatResponse, Escalation
from app.stand_client import StandError

WHICH_DOCTORS = re.compile(r"какие (у вас )?(есть )?(врач|специалист|доктор)|каких врачей|какие врачи")


HANDLERS = {"reminder": task_reminder, "booking": task_booking, "reschedule": task_reschedule, "cancel": task_cancel,
            "status": task_status, "schedule_info": task_schedule_info, "info": task_info,
            "home_visit": task_home_visit}


async def handle(session_id: str | None, text: str) -> ChatResponse:
    if not session_id or session_id not in SESSIONS:
        session_id = session_id or uuid.uuid4().hex[:12]
        SESSIONS[session_id] = {"id": session_id, "step": "start", "task": None, "c": {}, "miss": 0,
                                "call": journal.start_call(session_id)}
        if not text.strip():
            return reply(SESSIONS[session_id], GREETING)
    s = SESSIONS[session_id]
    text = text.strip()
    if s["step"] == "done":
        return ChatResponse(session_id=session_id, reply="Разговор завершён. Чтобы начать заново, позвоните ещё раз.",
                            done=True, collected=collected(s))
    if not text:
        return reply(s, "Вы меня слышите?")
    journal.say(s["call"], "patient", "[ФИО и дата рождения — скрыто]" if s["step"] in ("identity", "birth_date") else text)
    s["text"] = text.lower()

    if (esc := safety.check(text)):
        return await escalate(s, esc)

    if safety.asks_repeat(text) and s.get("last_reply"):
        s["repeats"] = s.get("repeats", 0) + 1
        if s["repeats"] >= 2:
            return await escalate(s, Escalation(rule="R-15", reason="не распознано", priority="P2",
                                                 summary="Пациент плохо слышит ассистента"))
        last = s["last_reply"]
        resp = reply(s, f"Повторяю. {last}", options=[])
        s["last_reply"] = last
        return resp

    if WHICH_DOCTORS.search(text.lower()):
        s["step"] = "specialty"
        s["task"] = s.get("task") or "booking"
        return reply(s, "У нас принимают терапевты, педиатры, офтальмологи, лор, неврологи, кардиологи, хирурги, "
                         "гинекологи, стоматологи и другие специалисты. К какому врачу записать?")

    nl = await nlu.understand(text, s["step"])
    if s["step"] not in ("identity", "birth_date") and not nl["birth_date"]:
        for key in ("last_name", "first_name", "middle_name"):
            nl[key] = None
    intent = nl["intent"]
    if s["step"] == "reason":
        nl["reason"] = nl["reason"] or text
        if intent in ("medical", "other", None):
            intent = "other"
    if s["step"] == "address" and not nl["address"]:
        nl["address"] = text
    if intent == "emergency":
        return await escalate(s, Escalation(rule="R-01", reason="неотложное состояние", priority="P1",
                                       emergency=True, summary=f"Возможная угроза жизни: «{text}»"))
    if intent == "operator":
        return await escalate(s, Escalation(rule="R-02", reason="просьба оператора", priority="P2",
                                       summary="Пациент попросил сотрудника"))
    if intent == "complaint":
        return await escalate(s, Escalation(rule="R-03", reason="жалоба", priority="P2", summary=f"Жалоба: «{text}»"))
    if intent == "medical":
        if s.get("medical_warned"):
            return await escalate(s, Escalation(rule="R-04", reason="медицинский вопрос", priority="P3",
                                           summary=f"Медицинский вопрос: «{text}»"))
        s["medical_warned"] = True
        return reply(s, "Я не могу давать медицинские советы — это может сделать только врач. "
                         "Давайте я запишу вас на приём к терапевту. Если состояние резко ухудшилось, звоните сто три.")
    if s["step"] == "more" and (intent == "goodbye" or (nl["answer"] == "no" and intent not in TASKS)):
        return finish(s)
    if intent == "goodbye" and not s.get("task"):
        return finish(s)

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
                return await escalate(s, Escalation(rule="R-05", reason="не распознано", priority="P3",
                                               summary="Ассистент трижды не понял пациента"))
            if s["miss"] == 2:
                return reply(s, "Простите, не поняла. Могу соединить с сотрудником, или скажите иначе: "
                                 "записаться, перенести или отменить запись?")
            return reply(s, "Я могу записать к врачу, перенести или отменить запись, вызвать врача на дом "
                             "или подсказать график. Что нужно?")
    s["miss"] = 0

    try:
        return await HANDLERS[s["task"]](s, nl)
    except (StandDown, StandError, httpx.HTTPError) as e:
        return await escalate(s, Escalation(rule="R-06", reason="сбой МИС", priority="P2",
                                       summary=f"Сбой МИС: {e}"))
