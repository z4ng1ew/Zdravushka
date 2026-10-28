# Справочные сценарии: график врача (С-07), справка по регламенту, вызов врача на дом (С-06).
import re
from datetime import datetime, timedelta

from app import journal, knowledge, prices, schedule
from app.dialog.common import collected, escalate, reply, send_escalation, task_done
from app.dialog.mis import add_comment, sms
from app.dialog.steps import is_same_doctor, need_identity
from app.models import ChatResponse, Escalation
from app.dialog.session import Session


async def task_schedule_info(s: Session, nl: dict) -> ChatResponse:
    """С-07. Когда принимает врач. Идентификация не нужна."""
    c = s.fields
    s.call["intent"] = "График врача"
    if s.step == "schedule_offer" and (r := await schedule_offer(s, nl)):
        return r
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
    # Регламент С-07: «Хирурги принимают каждый будний день. Волков — с восьми до четырнадцати, Никитина —
    # с четырнадцати до двадцати, кабинет сто двенадцать. Записать вас?» — фамилии, часы и кабинет словами
    docs = docs[:3]
    names = [d["full_name"] for d in docs]
    every = all(schedule.works_every_weekday(n) for n in names)
    head = ""
    if every and c.get("specialty") and len(docs) > 1 and not c["specialty"].startswith("Врач"):
        head = f"{_plural(c['specialty'])} принимают каждый будний день. "
    if schedule.uses_shifts(names):
        head += "Утром — с восьми до четырнадцати, вечером — с четырнадцати до двадцати. "
    lines = []
    for n in names:
        cab = (schedule.excel_doctor(n) or {}).get("cabinet")
        lines.append(f"{n.split()[0]} — {schedule.weekly_spoken(n) or 'по расписанию'}"
                     + (f", кабинет {schedule.cabinet_words(cab)}" if cab else ""))
    text = head + "; ".join(lines) + "."
    s.step = "schedule_offer"
    s.fields["_schedule_doctor"] = docs[0]["full_name"] if len(docs) == 1 else None
    return reply(s, text + " Записать вас?", source="расписание поликлиники",
                 explanation="График врачей из расписания поликлиники (регламент С-07).")


def _plural(specialty: str) -> str:
    """Хирург → Хирурги, Терапевт → Терапевты, Лор (отоларинголог) → Лор-врачи."""
    word = specialty.split()[0]
    return {"Лор": "Лор-врачи"}.get(word, word + ("и" if word[-1] in "гкх" else "ы"))


async def schedule_offer(s: Session, nl: dict) -> ChatResponse | None:
    """«Записать вас?» после графика: «да» — запись к этому врачу / специальности (С-01)."""
    from app.dialog.booking import task_booking
    if nl["answer"] == "yes" or nl["date"] or nl["part_of_day"]:
        doc = s.fields.pop("_schedule_doctor", None)
        if doc:
            s.fields["doctor_name"] = doc
        s.task, s.step = "booking", "start"
        return await task_booking(s, nl)
    if nl["answer"] == "no":
        return task_done(s, "Хорошо.", "справка")
    return None


async def task_info(s: Session, nl: dict) -> ChatResponse:
    """Справочные вопросы — ответ дословно из регламента."""
    s.call["intent"] = "Справка"
    if s.step in ("paid_offer", "paid_transfer", "paid_free") or nl["topic"] == "prices" or prices.asks_paid(s.text):
        return await task_paid(s, nl)
    text = knowledge.answer(nl["topic"])
    if not text:
        return await escalate(s, Escalation(rule="R-08", reason="не распознано", priority="P3",
                                       summary="Справочный вопрос вне базы знаний"))
    return task_done(s, text, "справка", source="регламент РГ-ТЕЛ-01",
                     explanation=f"Ответ дословно из базы знаний регламента, тема: {nl['topic']}.")


# ---------- С-09. Платные услуги (регламент РГ-ТЕЛ-01, пример диалога и ветвления) ----------
# «Сколько стоит УЗИ щитовидки?» → «УЗИ щитовидной железы стоит тысячу триста рублей. Записать вас?» →
# «Да, можно на субботу?» → время → ФИО и дата рождения → как С-01 → «Оплата — в кассе…». Цены — app/prices.py.

async def task_paid(s: Session, nl: dict) -> ChatResponse:
    from app.dialog.booking import task_booking
    s.call["intent"] = "Платные услуги"
    low = s.text.lower()
    if s.step == "paid_offer":
        if nl["answer"] == "yes" or nl["date"] or nl["part_of_day"]:
            s.task, s.step = "booking", "start"
            s.fields["specialty"] = s.fields["_paid"]["specialty"]
            return await task_booking(s, nl)
        if nl["answer"] == "no":
            return task_done(s, "Хорошо.", "справка")
    if s.step == "paid_transfer":  # «Записаться можно в платном отделении. Соединить?»
        if nl["answer"] == "yes":
            return await escalate(s, Escalation(rule="R-10", reason="запись на платную услугу", priority="P3",
                                                summary=f"Записать: {s.fields['_paid']['name']} — платное отделение"))
        if nl["answer"] == "no":
            return task_done(s, "Хорошо.", "справка")
    if s.step == "paid_free":  # «…Записать вас к участковому терапевту?»
        if nl["answer"] == "yes":
            s.fields.pop("_paid", None)
            s.task, s.step = "booking", "start"
            s.fields["specialty"] = "Терапевт"
            return await task_booking(s, nl)
        if nl["answer"] == "no":
            return task_done(s, "Хорошо.", "справка")
    if prices.TAX.search(low):
        return task_done(s, prices.TAX_ANSWER, "справка", source="регламент РГ-ТЕЛ-01")
    if prices.TRANSFER.search(low):
        return await escalate(s, Escalation(rule="R-10", reason="платные услуги: ДМС, договор или медкомиссия",
                                            priority="P3", summary="Вопрос в платное отделение (доб. 3)"))
    if prices.FREE.search(low) and s.step in ("paid_offer", "paid_transfer"):
        s.step = "paid_free"  # «А бесплатно можно?» — честно про ОМС
        return reply(s, prices.FREE_ANSWER, source="регламент РГ-ТЕЛ-01")
    svc = prices.find(s.text, nl.get("specialty"))
    if not svc:
        if not prices.names_service(s.text):  # «Какие у вас цены?» — общий ответ из базы знаний
            return task_done(s, knowledge.answer("prices"), "справка", source="регламент РГ-ТЕЛ-01")
        return await escalate(s, Escalation(rule="R-10", reason="платной услуги нет в прайс-листе", priority="P3",
                                            summary="Цена услуги вне прайс-листа — в платное отделение (доб. 3)"))
    s.fields["_paid"] = {"name": svc.name, "price": svc.price, "specialty": svc.specialty}
    s.call["result"] = "справка"  # регламент: INFO_GIVEN — цена сообщена
    if not svc.specialty:  # ЭКГ, анализы — не по расписанию врачей: записывает платное отделение
        s.step = "paid_transfer"
        return reply(s, f"{prices.price_phrase(svc)} Записаться можно в платном отделении. Соединить?",
                     source="прайс-лист, регламент РГ-ТЕЛ-01, раздел 2.6")
    s.step = "paid_offer"
    return reply(s, f"{prices.price_phrase(svc)} Записать вас?", source="прайс-лист, регламент РГ-ТЕЛ-01, раздел 2.6",
                 explanation=f"Цена из прайс-листа регламента (раздел 2.6): {svc.name} — {svc.price} ₽.")


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
