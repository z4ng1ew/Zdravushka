import re
import uuid

from app import config, schedule
from app.models import Booking, ChatResponse, Escalation

DEMO_DOCTORS = [
    {"id": 1, "full_name": "Смирнова Елена Викторовна", "specialty": "Терапевт", "is_active": True},
    {"id": 2, "full_name": "Иванов Пётр Сергеевич", "specialty": "Терапевт", "is_active": True},
    {"id": 4, "full_name": "Лебедев Андрей Игоревич", "specialty": "Офтальмолог", "is_active": True},
]

GREETING = (f"Здравствуйте! Я {config.ASSISTANT_NAME}, виртуальный помощник регистратуры "
            "поликлиники номер семь. Разговор записывается. Чем могу помочь?")

RED_FLAGS = ["боль в груди", "болит грудь", "не могу дышать", "задыха", "потерял сознание",
             "без сознания", "инсульт", "кровотечение"]
WANT_HUMAN = ["оператор", "человек", "сотрудник", "регистратор", "живой"]

SESSIONS: dict[str, dict] = {}


def _summary(s: dict) -> str:
    c = s["collected"]
    parts = [f"{k}: {v}" for k, v in c.items()]
    return "; ".join(parts) or "данных о пациенте нет"


async def handle(session_id: str | None, text: str) -> ChatResponse:
    if not session_id or session_id not in SESSIONS:
        session_id = session_id or uuid.uuid4().hex[:12]
        SESSIONS[session_id] = {"step": "start", "collected": {}, "options": []}
        if not text.strip():
            return ChatResponse(session_id=session_id, reply=GREETING)

    s = SESSIONS[session_id]
    low = text.lower()

    if any(f in low for f in RED_FLAGS):
        s["step"] = "done"
        return ChatResponse(
            session_id=session_id, intent="escalation", done=True, collected=s["collected"],
            reply="Немедленно звоните сто три или сто двенадцать. Соединяю с регистратором.",
            escalation=Escalation(rule="R-01", reason="Угроза жизни", priority="P1",
                                  emergency=True, summary=f"Пациент: «{text}». {_summary(s)}"))
    if any(w in low for w in WANT_HUMAN):
        s["step"] = "done"
        return ChatResponse(
            session_id=session_id, intent="escalation", done=True, collected=s["collected"],
            reply="Соединяю с сотрудником.",
            escalation=Escalation(rule="R-02", reason="Пациент попросил оператора",
                                  priority="P2", summary=_summary(s)))

    step = s["step"]

    if step == "start":
        if "запис" in low or "талон" in low or "к врачу" in low:
            s["collected"]["специальность"] = "Офтальмолог" if "окул" in low or "глаз" in low else "Терапевт"
            s["step"] = "ask_name"
            return ChatResponse(session_id=session_id, intent="booking", collected=s["collected"],
                                reply="Хорошо. Назовите, пожалуйста, фамилию, имя и отчество пациента.")
        return ChatResponse(session_id=session_id, collected=s["collected"],
                            reply="Я могу записать к врачу, перенести или отменить запись. Что нужно?")

    if step == "ask_name":
        s["collected"]["ФИО"] = text.strip().title()
        s["step"] = "ask_birth"
        return ChatResponse(session_id=session_id, intent="booking", collected=s["collected"],
                            reply="Спасибо. Назовите дату рождения.")

    if step == "ask_birth":
        s["collected"]["дата рождения"] = text.strip()
        doctors = [d for d in DEMO_DOCTORS if d["specialty"] == s["collected"]["специальность"]]
        found = schedule.find_free_slots(doctors, set())
        s["options"] = [Booking(doctor_id=d["id"], doctor_name=d["full_name"], specialty=d["specialty"],
                                scheduled_at=schedule.to_api(t), spoken=schedule.say_slot(t))
                        for d, t in found]
        s["step"] = "choose"
        variants = "; ".join(f"{i + 1}: {o.spoken}" for i, o in enumerate(s["options"]))
        return ChatResponse(session_id=session_id, intent="booking", collected=s["collected"],
                            options=s["options"],
                            reply=f"Есть свободное время. {variants}. Какой вариант удобен?")

    if step == "choose":
        m = re.search(r"\d", low)
        words = {"перв": 0, "втор": 1, "трет": 2}
        idx = int(m.group()) - 1 if m else next((v for k, v in words.items() if k in low), None)
        if idx is None or not (0 <= idx < len(s["options"])):
            return ChatResponse(session_id=session_id, intent="booking", collected=s["collected"],
                                options=s["options"], reply="Скажите номер варианта: первый, второй или третий.")
        s["chosen"] = s["options"][idx]
        s["step"] = "confirm"
        o = s["chosen"]
        return ChatResponse(session_id=session_id, intent="booking", collected=s["collected"],
                            booking=o, reply=f"Записываю: врач {o.doctor_name}, {o.spoken}. Верно?")

    if step == "confirm":
        if re.search(r"\b(да|верно|хорошо|подтверждаю)\b", low):
            o = s["chosen"].model_copy(update={"visit_id": 0, "status": "Запланирована"})
            s["step"] = "done"
            return ChatResponse(session_id=session_id, intent="booking", collected=s["collected"],
                                booking=o, done=True,
                                reply=f"Готово, вы записаны {o.spoken}. Возьмите паспорт и полис. Всего доброго!")
        s["step"] = "choose"
        return ChatResponse(session_id=session_id, intent="booking", collected=s["collected"],
                            options=s["options"], reply="Хорошо, выберите другой вариант.")

    return ChatResponse(session_id=session_id, done=True, collected=s["collected"],
                        reply="Разговор завершён. Чтобы начать заново, нажмите «Новый звонок».")