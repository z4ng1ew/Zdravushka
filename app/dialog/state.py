# Общее состояние диалога: подключение к МИС (стенд или его имитация) и сессии звонков.
from app import config, journal
from app.dialog.session import Session
from app.ports import MisPort
from app.stand_client import StandClient


def _make_stand() -> MisPort | None:
    """Настоящий стенд (DBI_API_TOKEN) или его имитация в памяти (STAND_MODE=mock) — для локальной отладки."""
    if config.STAND_MODE == "mock":
        from app import mock_stand
        return mock_stand.client()
    return StandClient() if config.STAND_TOKEN else None


stand: MisPort | None = _make_stand()


def use_stand(client: MisPort | None):
    """Подключить другую реализацию МИС (тесты, имитация) — сценарии при этом не меняются."""
    global stand
    stand = client


SESSIONS: dict[str, Session] = {}


def open_session(session_id: str, direction: str = "входящий", **values) -> Session:
    """Новая сессия разговора с записью в журнале звонков."""
    s = Session(id=session_id, call=journal.start_call(session_id, direction), **values)
    SESSIONS[session_id] = s
    return s


TASKS = {"booking", "reschedule", "cancel", "status", "schedule_info", "info", "home_visit"}


LABELS = {"specialty": "специальность", "last_name": "фамилия", "first_name": "имя",
          "middle_name": "отчество", "birth_date": "дата рождения", "date": "желаемая дата",
          "part_of_day": "время дня", "doctor_name": "врач", "address": "адрес", "reason": "повод"}


class StandDown(Exception):
    """МИС недоступна или отказала — по регламенту переводим на регистратора (R-06)."""
