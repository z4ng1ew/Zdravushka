from app import nlu
from app.dialog.session import Session

NAME_KEYS = ("last_name", "first_name", "middle_name")
REMEMBERED = ("specialty", "doctor_name", "last_name", "first_name", "middle_name", "birth_date",
              "date", "part_of_day", "address", "reason")
TASK_DETAILS = ("specialty", "doctor_name", "date", "part_of_day", "address", "reason")


async def interpret(s: Session, text: str) -> dict:
    nl = await nlu.understand(text, s.step)
    if s.step not in ("identity", "birth_date") and not nl["birth_date"]:
        for key in NAME_KEYS:
            nl[key] = None
    if s.step == "reason":
        nl["reason"] = nl["reason"] or text
        if nl["intent"] in ("medical", "other", None):
            nl["intent"] = "other"
    if s.step == "address" and not nl["address"]:
        nl["address"] = text
    return nl


def remember(s: Session, nl: dict):
    for key in REMEMBERED:
        if nl[key]:
            s.fields[key] = nl[key]


def forget_task_details(s: Session):
    s.forget_task_data()
    for key in TASK_DETAILS:
        s.fields.pop(key, None)
