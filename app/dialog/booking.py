# Сценарий С-01: запись на приём.

from app import schedule
from app.dialog.mis import BOOKING_LOCK
from app.dialog.common import reply, task_done
from app.dialog.mis import busy_slots, cancel_visit, create_visit, doctors_for
from app.dialog.steps import (PARENT_RE, age_specialty, for_child, genitive, choose_slot, fits_age, is_same_doctor, need_identity, offer_slots,
                               patient_age, room, wanted_specialty)
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
    for_child(s)  # «записать дочку» — запоминаем до вопроса о ФИО
    if (r := await need_identity(s)):
        return r
    age = patient_age(s)
    # Регламент (пример С-01 для ребёнка): после МИС — «Спасибо. Вы мама Алисы?»
    if age is not None and age < 18 and not c.get("_parent_ok"):
        name = genitive((s.client or {}).get("first_name") or c.get("first_name") or "ребёнка")
        if s.step == "parent":
            if PARENT_RE.search(s.text) or c.get("_parent_asked_who"):
                c["_parent_ok"] = True
                c["representative"] = s.text[:60]
                s.step = "start"
            else:  # «нет» — уточняем, кем приходится: записывает законный представитель
                c["_parent_asked_who"] = True
                return reply(s, f"Записать ребёнка может законный представитель. Кем вы приходитесь {name[:-1] + 'е' if name.endswith(('ы', 'и')) else 'ребёнку'}?")
        else:
            s.step = "parent"
            return reply(s, f"Спасибо. Вы мама {name}?",
                         explanation="Пациенту нет 18 лет — уточняем, что звонит законный представитель.")
    note = ""
    if not any(fits_age(d, age) for d in doctors) and (spec := age_specialty(c["specialty"], age)):
        who = "Пациенту нет восемнадцати лет" if age < 18 else "Педиатр принимает только детей"
        note = f"{who}, поэтому записываю к специалисту: {spec.lower()}. "
        c["specialty"] = spec
        c.pop("doctor_name", None)
        doctors = await doctors_for(spec)
    doctors = [d for d in doctors if fits_age(d, age)]
    if not doctors:
        c.pop("specialty", None)
        s.step = "specialty"
        return reply(s, "К этому специалисту по возрасту пациента записать не могу. Назовите другого врача.")

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
                busy = await busy_slots(s, fresh=True)
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
                await cancel_visit(s, old, notify=False)
                extra = " Прежняя запись отменена."
            return task_done(s, f"Готово, вы записаны {o.spoken}{room(o.doctor_name)}.{extra} "
                                 "SMS с деталями придёт на этот номер. "
                                 + ("На приём возьмите полис ребёнка и свой паспорт. " if c.get("_parent_ok")
                                    else "Возьмите паспорт и полис ОМС. ") +
                                 "Накануне придёт напоминание.", "записан", booking=done)
        if nl["answer"] == "no" or nl["date"] or nl["part_of_day"]:
            return await offer_slots(s, doctors)
        return reply(s, "Подтвердите, пожалуйста: записываю? Скажите «да» или «нет».", booking=s.chosen)
    else:
        resp = await offer_slots(s, doctors)
        # Пример диалога С-01: «Спасибо, Ольга Викторовна. … Ближайшее время: …»
        first, middle = s.fields.get("first_name"), s.fields.get("middle_name")
        thanks = (f"Спасибо, {first} {middle}. " if first and middle and not note and not s.options_shown
                  and not c.get("_parent_ok") else "")  # за ребёнка «Спасибо» уже сказали в «Вы мама …?»
        s.options_shown = True
        resp.reply = thanks + note + resp.reply
        return resp

    o = s.chosen
    return reply(s, f"Записываю: {o.specialty.lower()}, врач {o.doctor_name}, {o.spoken}{room(o.doctor_name)}. Верно?",
                  booking=o)
