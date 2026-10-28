# Справочные сценарии: график врача (С-07), справка по регламенту, вызов врача на дом (С-06).
import re
from datetime import datetime, timedelta

from app import journal, knowledge, schedule
from app.dialog.common import collected, escalate, reply, send_escalation, task_done
from app.dialog.mis import add_comment, sms
from app.dialog.steps import is_same_doctor, need_identity
from app.models import ChatResponse, Escalation
from app.dialog.session import Session


async def task_schedule_info(s: Session, nl: dict) -> ChatResponse:
    """С-07. Когда принимает врач. Идентификация не нужна."""
    c = s.fields
    s.call["intent"] = "График врача"
    docs = []
    if c.get("doctor_name"):
        docs = [d for d in schedule.demo_doctors() if is_same_doctor(d["full_name"], c["doctor_name"])]
        if not docs:
            c.pop("doctor_name")  # такого врача нет — дальше ищем по специальности, а не по кругу
    if not docs and c.get("specialty"):
        docs = [d for d in schedule.demo_doctors() if d["specialty"] == c["specialty"]][:3]
    if not docs:
        s.step = "specialty"
        return reply(s, "Какой врач вас интересует? Назовите фамилию или специальность.")
    lines = [f"{d['full_name']}: {schedule.weekly_text(d['full_name'])}" for d in docs[:3]]
    return task_done(s, "График приёма. " + "; ".join(lines) + ". Если нужно, могу записать к этому врачу.", "справка")


async def task_info(s: Session, nl: dict) -> ChatResponse:
    """Справочные вопросы — ответ дословно из регламента."""
    s.call["intent"] = "Справка"
    text = knowledge.answer(nl["topic"])
    if not text:
        return await escalate(s, Escalation(rule="R-08", reason="не распознано", priority="P3",
                                       summary="Справочный вопрос вне базы знаний"))
    return task_done(s, text, "справка", source="регламент РГ-ТЕЛ-01",
                     explanation=f"Ответ дословно из базы знаний регламента, тема: {nl['topic']}.")


async def task_home_visit(s: Session, nl: dict) -> ChatResponse:
    """С-06. Вызов врача на дом: заявка участковому врачу, адрес и повод — в комментарии."""
    c = s.fields
    s.call["intent"] = "Вызов врача на дом"
    now = schedule.now()
    if now.weekday() == 6:
        return task_done(s, "В воскресенье заявки на дом не принимаются. Если состояние ухудшится — звоните сто три.",
                          "справка")
    if not s.warned:
        s.warned = True
        if not (c.get("last_name") and c.get("birth_date")):
            s.step = "identity"
            # Скрипты С-06 — дословно по примеру диалога регламента
            return reply(s, "Хорошо. Сначала важное: если сейчас сильная боль в груди, трудно дышать или человек "
                            "теряет сознание — положите трубку и звоните сто три. Если нет, продолжим. "
                            "Назовите фамилию, имя, отчество и дату рождения пациента.")
    if (r := await need_identity(s)):
        return r
    if not c.get("address"):
        s.step = "address"
        name = " ".join(x for x in (c.get("first_name"), c.get("middle_name")) if x)
        return reply(s, f"{name + ', н' if name else 'Н'}азовите адрес, куда должен прийти врач.")
    if not c.get("reason"):
        s.step = "reason"
        return reply(s, "Спасибо. Коротко скажите своими словами, что случилось. Я передам врачу.")
    birth = datetime.strptime(c["birth_date"], "%d.%m.%Y").date()
    child = (now.date() - birth).days < 18 * 365
    if s.step == "reason":
        s.step = "can_come"
        return reply(s, "Передам врачу. Вы можете сами прийти в поликлинику?")
    if s.step == "can_come":
        if nl["answer"] == "yes" or re.search(r"\b(могу|смогу|приду|дойду)\b", s.text) and not re.search(r"не (могу|смогу|приду|дойду)", s.text):
            # Может прийти сам — удобнее и быстрее запись на приём (С-01), заявку на дом не создаём
            s.task, s.step = "booking", "start"
            s.fields["specialty"] = "Педиатр" if child else "Терапевт"
            for key in ("address", "reason"):
                s.fields.pop(key, None)
            from app.dialog.booking import task_booking
            resp = await task_booking(s, nl)
            resp.reply = "Тогда удобнее записаться на приём. " + resp.reply
            return resp
        if nl["answer"] != "no" and not re.search(r"\bнет\b|тяжело|не могу|не смогу|не дойду", s.text):
            return reply(s, "Скажите, пожалуйста: можете прийти в поликлинику сами или нужен врач на дом?")
    if s.step == "phone_confirm":
        if nl["answer"] == "no" or re.search(r"\bнет\b|другой", s.text):
            s.step = "phone"
            return reply(s, "Назовите, пожалуйста, номер телефона для связи.")
        return _home_visit_bye(s)
    if s.step == "phone":
        digits = re.sub(r"\D", "", s.text)
        if len(digits) >= 10:
            await add_comment(s, f"Телефон для связи по вызову на дом: {digits[-10:]}")
        return _home_visit_bye(s)

    # Заявки до 14:00 в будни (до 12:00 в субботу) — на сегодня, позже — на следующий рабочий день
    limit = 12 if now.weekday() == 5 else 14
    day = now.date() if now.hour < limit else now.date() + timedelta(days=1)
    while day.weekday() == 6 or day in schedule.HOLIDAYS:
        day += timedelta(days=1)
    specialist = "педиатр" if child else "участковый терапевт"
    note = (f"ВЫЗОВ ВРАЧА НА ДОМ на {day.strftime('%d.%m.%Y')} ({specialist}). Адрес: {c['address']}. "
            f"Повод (слова пациента): {c['reason']}. Требует подтверждения регистратором.")
    # Заявка на специалиста в МИС: адрес и повод — в описании (так попросили организаторы)
    await send_escalation(s, note)
    await add_comment(s, note)
    sms(s, "Вызов на дом принят")  # записи нет — без #id (формат организаторов)
    journal.handoff(s.call, "вызов на дом", False, note, collected(s))
    when_text = "сегодня" if day == now.date() else schedule.say_date(day)
    s.call["result"] = "записан"
    s.step = "phone_confirm"
    return reply(s, f"Хорошо, заявка принята на {when_text}. Врач придёт до восемнадцати часов, точное время "
                    "назвать не могу. Регистратор проверит заявку и перезвонит, только если понадобится "
                    "уточнение. Телефон для связи — этот?", source="МИС", status="completed",
                 explanation="Заявка на вызов врача на дом создана в МИС, требует подтверждения регистратором.")


def _home_visit_bye(s: Session) -> ChatResponse:
    """Финал С-06 по регламенту."""
    s.last_task, s.task = s.task, None
    return reply(s, "Хорошо. Если станет хуже — звоните сто три. Выздоравливайте!", done=True)
