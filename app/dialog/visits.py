# Сценарии с существующими записями: перенос (С-03), отмена (С-04), статус (С-05).
import re

from app import schedule
from app.dialog.mis import BOOKING_LOCK
from app.dialog.booking import task_booking
from app.dialog.common import reminder_status, reply, task_done
from app.dialog.mis import busy_slots, cancel_visit, client_visits, reschedule_visit
from app.dialog.steps import (
    choose_slot,
    choose_visit,
    is_same_doctor,
    need_identity,
    offer_slots,
    room,
    visit_booking,
    wanted_specialty,
)
from app.models import ChatResponse
from app.dialog.session import Session

ALL_OF_THEM = re.compile(r"\b(обе|оба|все|всё|обеих|каждую)\b")


async def task_reschedule(s: Session, nl: dict) -> ChatResponse:
    """С-03. Перенос записи: та же запись, новое время у того же врача."""
    s.call["intent"] = "Перенос записи"
    if (r := await need_identity(s, create=False)):
        return r
    if not s.visit and (r := await choose_visit(s, nl, "перенести")):
        return r
    visit = s.visit
    doctor = visit["doctor"]
    wanted = s.fields.get("doctor_name")
    if wanted and not is_same_doctor(doctor["full_name"], wanted):
        # Перенос в МИС меняет только время. К другому врачу — новая запись, старая отменяется после «да»
        s.replace_visit = visit
        s.forget_task_data()
        s.fields["specialty"] = wanted_specialty(wanted) or doctor["specialty"]
        s.task, s.step = "booking", "start"
        r = await task_booking(s, nl)
        r.reply = "К другому врачу оформлю новую запись, а прежнюю отменю. " + r.reply
        return r

    async def same_doctor():
        return [doctor]

    if s.step == "choose_slot":
        if (r := await choose_slot(s, nl, same_doctor)):
            return r
    elif s.step == "confirm":
        if nl["answer"] == "yes":
            o = s.chosen
            async with BOOKING_LOCK:  # проверка слота и перенос — атомарно (см. booking.py)
                taken = (o.doctor_id, o.scheduled_at) in await busy_slots(s, fresh=True)
                updated = None if taken else await reschedule_visit(s, visit, o)
            if taken:
                return await offer_slots(s, [doctor], exclude=(doctor["id"], visit["scheduled_at"]))
            reminder_status(s, "перенёс", o.scheduled_at, visit_id=visit["id"])
            return task_done(s, f"Готово, запись перенесена. Новое время: {o.spoken}{room(o.doctor_name)}. "
                                "SMS придёт на этот номер.", "перенесён",
                              booking=visit_booking(updated))
        if nl["answer"] == "no" or nl["date"] or nl["part_of_day"]:
            return await offer_slots(s, [doctor], exclude=(doctor["id"], visit["scheduled_at"]))
        return reply(s, "Подтвердите перенос: да или нет?", booking=s.chosen)
    else:
        return await offer_slots(s, [doctor], exclude=(doctor["id"], visit["scheduled_at"]))

    o = s.chosen
    old = schedule.say_slot(schedule.from_api(visit["scheduled_at"]))
    return reply(s, f"Переношу запись, врач {o.doctor_name}. Было: {old}. Станет: {o.spoken}. Верно?",
                  booking=o)


async def task_cancel(s: Session, nl: dict) -> ChatResponse:
    """С-04. Отмена записи (запись не удаляется, а получает статус «Отменена»)."""
    s.call["intent"] = "Отмена записи"
    if (r := await need_identity(s, create=False)):
        return r
    if s.step == "confirm_all":
        # Массовая отмена — только после явного «да»: распознавание могло ослышаться («какие все…»)
        if nl["answer"] == "yes":
            for v in s.visits[:3]:
                await cancel_visit(s, v)
                reminder_status(s, "отменил", visit_id=v["id"])
            return task_done(s, f"Отменила все записи: {len(s.visits[:3])}. Спасибо, что предупредили.", "отменён")
        if nl["answer"] == "no":
            return task_done(s, "Хорошо, записи остаются.", "справка")
        return reply(s, "Отменить все эти записи? Скажите «да» или «нет».")
    if s.step == "choose_visit" and ALL_OF_THEM.search(s.text) and s.visits:
        s.step = "confirm_all"
        items = [visit_booking(v) for v in s.visits[:3]]
        listing = "; ".join(f"{b.specialty.lower()}, {b.spoken}" for b in items)
        return reply(s, f"Отменяю все записи: {listing}. Верно?", options=items,
                     explanation="Перед отменой нескольких записей ассистент всегда переспрашивает.")
    if not s.visit and (r := await choose_visit(s, nl, "отменить")):
        return r
    b = visit_booking(s.visit)
    if s.step == "confirm":
        # Регламент С-04: «Перед отменой ГА один раз предлагает перенос. Если пациент отказывается — отменяет без уговоров»
        if nl["intent"] == "reschedule" or "перен" in s.text:
            visit = s.visit
            s.task, s.step = "reschedule", "start"
            s.visit = visit
            return await task_reschedule(s, nl)
        if nl["answer"] == "yes" or "отмен" in s.text:
            updated = await cancel_visit(s, s.visit)
            reminder_status(s, "отменил", visit_id=s.visit["id"])
            return task_done(s, "Готово, запись отменена. Спасибо, что предупредили — это время достанется "
                                "другому пациенту.", "отменён", booking=visit_booking(updated))
        if nl["answer"] == "no":
            return task_done(s, "Хорошо, запись остаётся.", "справка")
        return reply(s, "Скажите, пожалуйста: перенести запись или отменить?", booking=b)
    s.step = "confirm"
    return reply(s, f"У вас запись: {b.specialty.lower()}, врач {b.doctor_name}, {b.spoken}. "
                    "Могу перенести её на другой день вместо отмены. Перенести или отменить?", booking=b,
                 explanation="Регламент С-04: перед отменой ассистент один раз предлагает перенос.")


async def task_status(s: Session, nl: dict) -> ChatResponse:
    """С-05. Проверка своей записи. Данные называем только после идентификации."""
    s.call["intent"] = "Статус записи"
    if (r := await need_identity(s, create=False)):
        return r
    visits = await client_visits(s)
    if not visits:
        return task_done(s, "У вас нет предстоящих записей.", "справка")
    items = [visit_booking(v) for v in visits[:3]]
    text = "; ".join(f"{b.specialty.lower()}, врач {b.doctor_name}, {b.spoken}{room(b.doctor_name)}" for b in items)
    return task_done(s, f"Вы записаны: {text}.", "справка", options=items)
