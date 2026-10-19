from dataclasses import dataclass, field, fields

from app.models import Booking


@dataclass
class Session:
    id: str
    call: dict
    step: str = "start"
    task: str | None = None
    last_task: str | None = None
    fields: dict = field(default_factory=dict)
    text: str = ""
    last_reply: str | None = None
    miss: int = 0
    repeats: int = 0
    unsure: int = 0
    id_attempts: int = 0
    asr_confidence: float | None = None
    understood_by: str | None = None
    medical_warned: bool = False
    warned: bool = False
    client: dict | None = None
    visits: list | None = None
    visit: dict | None = None
    options: list[Booking] = field(default_factory=list)
    chosen: Booking | None = None
    replace_visit: dict | None = None
    reminder_visit_id: int | None = None

    def forget_task_data(self):
        self.options, self.visits, self.visit, self.chosen = [], None, None, None

    def take(self, name: str):
        value = getattr(self, name)
        default = next(f for f in fields(self) if f.name == name)
        setattr(self, name, default.default_factory() if callable(default.default_factory) else default.default)
        return value
