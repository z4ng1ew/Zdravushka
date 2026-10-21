# Понимание фразы в контексте разговора: результат NLU + поправки по тому, что ассистент сейчас спрашивал.
from app import nlu, schedule
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
    if s.step not in ("identity", "birth_date", "middle_name") and not nl["birth_date"]:
        for key in NAME_KEYS:
            nl[key] = None
    if s.step in ("identity", "birth_date", "middle_name"):
        _collect_birth_date(s, nl)
    # Ждём конкретный ответ (повод вызова, адрес) — симптомы здесь это ответ, а не медицинский вопрос
    if s.step == "reason":
        nl["reason"] = nl["reason"] or text
        if nl["intent"] in ("medical", "other", None):
            nl["intent"] = "other"
    if s.step == "address" and not nl["address"]:
        nl["address"] = text
    return nl


def _collect_birth_date(s: Session, nl: dict):
    """Дата рождения по частям: «Иванов Иван, 2000» + «13 апреля» → 13.04.2000.
    Каждая часть взята из слов пациента (nlu.ground), ничего не досочиняется."""
    if nl["birth_date"]:
        return
    year = nl.get("birth_year")
    if year and int(year) <= schedule.now().year:
        s.fields["_birth_year"] = year
    if nl.get("birth_dm"):
        s.fields["_birth_dm"] = nl["birth_dm"]
    dm, year = s.fields.get("_birth_dm"), s.fields.get("_birth_year")
    if dm and year:
        nl["birth_date"] = nlu._valid_date(f"{dm}.{year}", past=True)
        s.fields.pop("_birth_dm", None)
        s.fields.pop("_birth_year", None)


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
