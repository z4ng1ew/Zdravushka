
from app import config, journal
from app.dialog.common import escalate, reminder_status, reply
from app.dialog.mis import add_comment, cancel_visit
from app.dialog.state import SESSIONS
from app.dialog.steps import room, visit_booking
from app.dialog.visits import task_reschedule
from app.models import ChatResponse, Escalation


def start_reminder(session_id: str, visit: dict) -> ChatResponse:
    s = {"id": session_id, "step": "remind", "task": "reminder", "c": {}, "miss": 0,
         "call": journal.start_call(session_id, "исходящий"),
         "client": {"id": visit["client_id"]}, "visit": visit, "reminder_visit_id": visit["id"]}
    s["call"]["intent"] = "Напоминание о приёме"
    SESSIONS[session_id] = s
    reminder_status(s, "звоним")
    b = visit_booking(visit)
    return reply(s, f"Здравствуйте! Это {config.ASSISTANT_NAME}, виртуальный помощник регистратуры "
                     f"поликлиники номер семь. Разговор записывается. Напоминаю о записи: {b.specialty.lower()}, врач {b.doctor_name}, "
                     f"{b.spoken}{room(b.doctor_name)}. Вы придёте?", booking=b)


async def task_reminder(s: dict, nl: dict) -> ChatResponse:
    intent = nl["intent"]
    if intent == "reschedule" or (s["step"] == "remind_no" and (nl["date"] or nl["part_of_day"]
                                                                or nl["choice"] == 2)):
        s["task"], s["step"] = "reschedule", "start"
        return await task_reschedule(s, nl)
    if intent == "cancel" or (s["step"] == "remind_no" and (nl["answer"] == "yes" or nl["choice"] == 1)):
        await cancel_visit(s, s["visit"])
        reminder_status(s, "отменил")
        s["call"]["result"] = "отменён"
        return reply(s, "Запись отменена, время освободится для других пациентов. "
                         "Если понадобится, позвоните нам, и мы запишем вас снова. Всего доброго!", done=True)
    if s["step"] == "remind" and nl["answer"] == "yes":
        reminder_status(s, "подтвердил")
        s["call"]["result"] = "подтверждён"
        await add_comment(s, f"Подтвердил визит {s['visit']['scheduled_at']} (звонок-напоминание)")
        return reply(s, "Спасибо, ждём вас. Возьмите паспорт и полис ОМС. Всего доброго!", done=True)
    if s["step"] == "remind" and nl["answer"] == "no":
        s["step"] = "remind_no"
        return reply(s, "Понятно. Отменить запись или подобрать другое время?")
    s["miss"] += 1
    if s["miss"] >= 2:
        return await escalate(s, Escalation(rule="R-05", reason="не распознано", priority="P3",
                                             summary="Напоминание: пациент не дал понятного ответа"))
    if s["step"] == "remind_no":
        return reply(s, "Скажите, пожалуйста: отменить запись или перенести на другое время?")
    return reply(s, "Простите, не поняла. Вы придёте на приём? Скажите «да» или «нет».")
