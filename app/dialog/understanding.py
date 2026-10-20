# Понимание фразы в контексте разговора: результат NLU + поправки по тому, что ассистент сейчас спрашивал.
from app import nlu
from app.dialog.session import Session

NAME_KEYS = ("last_name", "first_name", "middle_name")
REMEMBERED = ("specialty", "doctor_name", "last_name", "first_name", "middle_name", "birth_date",
              "date", "part_of_day", "address", "reason")
TASK_DETAILS = ("specialty", "doctor_name", "date", "part_of_day", "address", "reason")


async def interpret(s: Session, text: str) -> dict:
    """Фраза → проверенные поля (app/nlu.py) с поправками на текущий шаг разговора."""
    nl = await nlu.understand(text, s.step)
    # ФИО берём, только когда его спрашивали (или назвали вместе с датой рождения),
    # иначе модель может принять за фамилию случайное слово из фразы
    if s.step not in ("identity", "birth_date") and not nl["birth_date"]:
        for key in NAME_KEYS:
            nl[key] = None
    # Ждём конкретный ответ (повод вызова, адрес) — симптомы здесь это ответ, а не медицинский вопрос
    if s.step == "reason":
        nl["reason"] = nl["reason"] or text
        if nl["intent"] in ("medical", "other", None):
            nl["intent"] = "other"
    if s.step == "address" and not nl["address"]:
        nl["address"] = text
    return nl


def remember(s: Session, nl: dict):
    """Запоминаем всё, что пациент назвал (специальность, ФИО, дату…)."""
    for key in REMEMBERED:
        if nl[key]:
            s.fields[key] = nl[key]


def forget_task_details(s: Session):
    """Новая задача: забываем детали прошлой (врач, дата, адрес), но помним пациента."""
    s.forget_task_data()
    for key in TASK_DETAILS:
        s.fields.pop(key, None)
