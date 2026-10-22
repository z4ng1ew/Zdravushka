# Состояние одного разговора (звонка или чата) — типизированная сессия вместо словаря.
# Все шаги сценариев читают и меняют только её; так видно, какие данные у разговора бывают.
from dataclasses import dataclass, field, fields

from app.models import Booking


@dataclass
class Session:
    id: str
    call: dict                                   # запись в журнале звонков (app/journal.py)
    step: str = "start"                          # на какой вопрос ассистент ждёт ответ
    task: str | None = None                      # текущий сценарий: booking, reschedule, ...
    last_task: str | None = None                 # предыдущий выполненный сценарий
    fields: dict = field(default_factory=dict)   # что пациент уже назвал: специальность, ФИО, дата...
    text: str = ""                               # последняя фраза пациента (нижний регистр)
    last_reply: str | None = None                # последняя фраза ассистента (для «повторите»)
    loop: int = 0                                # сколько раз подряд ассистент повторил тот же вопрос
    miss: int = 0                                # сколько раз подряд не поняли пациента
    repeats: int = 0                             # сколько раз пациент просил повторить
    unsure: int = 0                              # сколько раз распознали речь неуверенно
    id_attempts: int = 0                         # неудачные попытки найти пациента / понять дату рождения
    asr_confidence: float | None = None          # уверенность распознавания последней фразы
    understood_by: str | None = None             # кто понял последнюю фразу: llm или rules
    medical_warned: bool = False                 # уже предупреждали, что медсоветов не даём
    warned: bool = False                         # уже напомнили про 103 при вызове на дом
    client: dict | None = None                   # карточка пациента в МИС
    visits: list | None = None                   # записи пациента (None — ещё не загружали)
    visit: dict | None = None                    # запись, с которой работаем (перенос, отмена)
    options: list[Booking] = field(default_factory=list)  # предложенные варианты времени
    chosen: Booking | None = None                # выбранный вариант, ждёт подтверждения
    replace_visit: dict | None = None            # «перенос» к другому врачу: старая запись к отмене
    notes: list = field(default_factory=list)    # строки для комментария клиента в МИС (SMS, подтверждение) — пишутся одним PATCH
    reminder_visit_id: int | None = None         # звонок-напоминание: о какой записи

    def forget_task_data(self):
        """Забыть промежуточные данные сценария (варианты, выбранную запись) — задача закончена или сменилась."""
        self.options, self.visits, self.visit, self.chosen = [], None, None, None

    def take(self, name: str):
        """Забрать значение поля и сбросить его к значению по умолчанию."""
        value = getattr(self, name)
        default = next(f for f in fields(self) if f.name == name)
        setattr(self, name, default.default_factory() if callable(default.default_factory) else default.default)
        return value
