# Контракт API: какие данные принимает и возвращает сервер.
# Это договорённость между бэкендом и фронтендом. Меняем только вместе с Муслимом.
from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    """Реплика пациента. session_id пустой — значит, начинается новый звонок.
    Длина и формат ограничены: защита от мусора и попыток переполнить запрос к нейросети."""
    session_id: str | None = Field(None, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")
    text: str = Field("", max_length=1000)
    asr_confidence: float | None = Field(None, ge=0, le=1)  # уверенность распознавания, если фраза голосом


class Booking(BaseModel):
    """Запись на приём, с которой сейчас работает разговор."""
    visit_id: int | None = None
    doctor_id: int | None = None
    doctor_name: str | None = None
    specialty: str | None = None
    scheduled_at: str | None = None      # '16.10.2026 10:30' — как в стенде
    spoken: str | None = None            # «в пятницу, шестнадцатого октября, в десять тридцать»
    status: str | None = None            # Запланирована / Отменена / Завершена


class Escalation(BaseModel):
    """Перевод на человека (карточка перевода по регламенту)."""
    rule: str                            # код правила: R-01 ... R-08
    reason: str                          # причина по-человечески
    priority: str                        # P1 — срочно, P2, P3
    emergency: bool = False              # True — угроза жизни, нужно 103/112
    summary: str                         # краткое резюме разговора для регистратора


class ChatResponse(BaseModel):
    """Ответ Здравушки на одну реплику."""
    session_id: str
    reply: str                           # что Здравушка говорит (текст для экрана и озвучки)
    intent: str | None = None            # booking / reschedule / cancel / status / info / escalation
    collected: dict = Field(default_factory=dict)   # что уже узнали: ФИО, дата рождения, специальность...
    options: list[Booking] = Field(default_factory=list)  # предложенные варианты времени (до 3)
    booking: Booking | None = None       # итоговая запись, если создана/изменена
    escalation: Escalation | None = None # заполнено, если разговор передан человеку
    done: bool = False                   # True — разговор окончен
    understood_by: str | None = None     # кто понял фразу: "llm" — нейросеть, "rules" — запасной разбор
    asr_confidence: float | None = None  # уверенность распознавания речи 0..1 (если фраза была голосом)
    explanation: str | None = None       # почему так: правило регламента, источник данных, проверка слота
    status: str = "in_progress"          # in_progress / completed / handoff / error — итог реплики для интерфейса
    label: str | None = None             # готовая подпись под ответом для экрана («✓ Записано в МИС · № 837»); тексты — app/ui_texts.py
    source: str | None = None            # откуда ответ: МИС / регламент / сотрудник (чтобы было видно, что не выдумано)
