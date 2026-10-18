from app import config
from app.stand_client import StandClient


def _make_stand() -> StandClient | None:
    if config.STAND_MODE == "mock":
        from app import mock_stand
        return mock_stand.client()
    return StandClient() if config.STAND_TOKEN else None


stand = _make_stand()


SESSIONS: dict[str, dict] = {}


TASKS = {"booking", "reschedule", "cancel", "status", "schedule_info", "info", "home_visit"}


LABELS = {"specialty": "специальность", "last_name": "фамилия", "first_name": "имя",
          "middle_name": "отчество", "birth_date": "дата рождения", "date": "желаемая дата",
          "part_of_day": "время дня", "doctor_name": "врач", "address": "адрес", "reason": "повод"}


class StandDown(Exception):
    """МИС недоступна или отказала — по регламенту переводим на регистратора (R-06)."""
