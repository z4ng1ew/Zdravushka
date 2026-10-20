# Сценарий С-01: запись на приём.

from app import schedule
from app.dialog.mis import BOOKING_LOCK
from app.dialog.common import reply, task_done
from app.dialog.mis import busy_slots, cancel_visit, create_visit, doctors_for
from app.dialog.steps import choose_slot, is_same_doctor, need_identity, offer_slots, room, wanted_specialty
from app.models import ChatResponse
from app.dialog.session import Session


async def task_booking(s: Session, nl: dict) -> ChatResponse:
    """С-01. Запись на приём."""
    c = s.fields
    s.call["intent"] = "Запись к врачу"
    if c.get("doctor_name") and not c.get("specialty"):
        c["specialty"] = wanted_specialty(c["doctor_name"])
        if not c["specialty"]:
            c.pop("specialty")
    if not c.get("specialty"):
        s.step = "specialty"
        return reply(s, "К какому врачу вас записать?")
    doctors = await doctors_for(c["specialty"])
    if not doctors:
        c.pop("specialty")
        s.step = "specialty"
        return reply(s, "К такому специалисту записать не могу. Назовите другого врача, например терапевта.")
    if c.get("doctor_name"):  # пациент хочет конкретного врача
        chosen_docs = [d for d in doctors if is_same_doctor(d["full_name"], c["doctor_name"])]
        if chosen_docs:
            doctors = chosen_docs
    if (r := await need_identity(s)):
        return r

    if s.step == "choose_slot":
        if (r := await choose_slot(s, nl, lambda: doctors_for(c["specialty"]))):
            return r
    elif s.step == "confirm":
        if nl["answer"] == "yes":
            o = s.chosen
            doc = next(d for d in doctors if d["id"] == o.doctor_id)
            # Стенд не проверяет занятость, поэтому проверка «слот свободен» и создание записи идут
            # под одной блокировкой: два одновременных звонка не займут одно время
            async with BOOKING_LOCK:
                busy = await busy_slots(s)
                if (o.doctor_id, o.scheduled_at) in busy or not schedule.is_valid_slot(doc, schedule.from_api(o.scheduled_at)):
                    taken = True
                else:
                    taken = False
                    visit = await create_visit(s, o)
            if taken:
                resp = await offer_slots(s, doctors)  # время успели занять — предлагаем заново
                resp.reply = "Это время только что заняли. " + resp.reply
                return resp
            done = o.model_copy(update={"visit_id": visit["id"], "status": "Запланирована"})
            extra = ""
            if (old := s.take("replace_visit")):  # «перенос» к другому врачу: старую запись отменяем
                await cancel_visit(s, old)
                extra = " Прежняя запись отменена."
            return task_done(s, f"Готово, вы записаны {o.spoken}{room(o.doctor_name)}.{extra} "
                                 "Возьмите паспорт и полис ОМС.", "записан", booking=done)
        if nl["answer"] == "no" or nl["date"] or nl["part_of_day"]:
            return await offer_slots(s, doctors)
        return reply(s, "Подтвердите, пожалуйста: записываю? Скажите «да» или «нет».", booking=s.chosen)
    else:
        return await offer_slots(s, doctors)

    o = s.chosen
    return reply(s, f"Записываю: {o.specialty.lower()}, врач {o.doctor_name}, {o.spoken}{room(o.doctor_name)}. Верно?",
                  booking=o)
