# Исходящий звонок-напоминание (С-10): подтвердить, отменить или перенести визит.

from app import config
from app.dialog.common import escalate, reminder_status, reply
import re

from app import schedule
from app.dialog.mis import add_comment, cancel_visit, sms
from app.dialog.state import open_session
from app.dialog.steps import room, visit_booking
from app.dialog.visits import task_reschedule
from app.models import ChatResponse, Escalation
from app.dialog.session import Session


def start_followup(session_id: str, text: str) -> ChatResponse:
    """Обратный звонок без записи на приём (обращение передано регистратору, справка):
    короткое сообщение, дальше — обычный разговор, как при входящем звонке."""
    s = open_session(session_id, "исходящий")
    s.call["intent"] = "Обратный звонок"
    return reply(s, text)


def start_reminder(session_id: str, visit: dict) -> ChatResponse:
    """Начало исходящего звонка: пациент уже известен (из записи), сразу напоминаем о приёме."""
    s = open_session(session_id, "исходящий", step="remind", task="reminder",
                     client={"id": visit["client_id"]}, visit=visit, reminder_visit_id=visit["id"])
    s.call["intent"] = "Напоминание о приёме"
    reminder_status(s, "звоним")
    b = visit_booking(visit)
    return reply(s, f"Здравствуйте! Это {config.ASSISTANT_NAME}, виртуальный помощник регистратуры "
                     f"поликлиники номер семь. Разговор записывается. Напоминаю о записи: {b.specialty.lower()}, врач {b.doctor_name}, "
                     f"{b.spoken}{room(b.doctor_name)}. Вы придёте?", booking=b)


def _opt_out(s: Session, all_messages: bool) -> ChatResponse:
    """«Не звоните мне больше» (С-10): отметка в МИС, код OPT_OUT. Запись на приём не меняется.
    Отказ от звонков — SMS-напоминания приходят; отказ от всех уведомлений — и SMS не шлём."""
    today = schedule.now().strftime("%d.%m.%Y")
    s.notes.clear()
    if all_messages:
        add_note = f"Отказ от уведомлений {today}"
        text = "Хорошо, напоминаний больше не будет — ни звонком, ни SMS. Ваша запись остаётся. Всего доброго!"
    else:
        add_note = f"Отказ от обзвона {today}"
        sms(s, "Напоминание", s.visit["id"])
        text = "Хорошо, больше не буду звонить с напоминаниями. Вы будете получать только SMS. Всего доброго!"
    s.notes.insert(0, add_note)
    reminder_status(s, "отказ от обзвона")
    s.call["result"] = "OPT_OUT"
    return reply(s, text, done=True, source="регламент РГ-ТЕЛ-01, С-10")


async def task_reminder(s: Session, nl: dict) -> ChatResponse:
    """Ответ пациента на напоминание: придёт / отменить / перенести."""
    intent = nl["intent"]
    if re.search(r"не звоните|не звонить|больше не звон|не надо звонить|не беспокойте", s.text):
        return _opt_out(s, all_messages=bool(re.search(r"смс|sms|сообщени|уведомлен|ничего не присылайте", s.text)))
    if not s.call.get("_sms_reminder"):  # SMS-напоминание за день — при любом исходе звонка (С-10), один раз
        s.call["_sms_reminder"] = True
        sms(s, "Напоминание", s.visit["id"])
    if intent == "reschedule" or (s.step == "remind_no" and (nl["date"] or nl["part_of_day"]
                                                                or nl["choice"] == 2)):
        s.task, s.step = "reschedule", "start"
        return await task_reschedule(s, nl)
    if intent == "cancel" or (s.step == "remind_no" and (nl["answer"] == "yes" or nl["choice"] == 1)):
        await cancel_visit(s, s.visit)
        reminder_status(s, "отменил")
        s.call["result"] = "отменён"
        return reply(s, "Запись отменена, время освободится для других пациентов. "
                         "Если понадобится, позвоните нам, и мы запишем вас снова. Всего доброго!", done=True)
    if s.step == "remind" and nl["answer"] == "yes":
        reminder_status(s, "подтвердил")
        s.call["result"] = "подтверждён"
        await add_comment(s, f"Подтверждена запись #{s.visit['id']} {s.visit['scheduled_at']}")
        return reply(s, "Спасибо, ждём вас. Возьмите паспорт и полис ОМС. Всего доброго!", done=True)
    if s.step == "remind" and nl["answer"] == "no":
        s.step = "remind_no"
        return reply(s, "Понятно. Отменить запись или подобрать другое время?")
    s.miss += 1
    if s.miss >= 2:
        return await escalate(s, Escalation(rule="R-05", reason="не распознано", priority="P3",
                                             summary="Напоминание: пациент не дал понятного ответа"))
    if s.step == "remind_no":
        return reply(s, "Скажите, пожалуйста: отменить запись или перенести на другое время?")
    return reply(s, "Простите, не поняла. Вы придёте на приём? Скажите «да» или «нет».")
