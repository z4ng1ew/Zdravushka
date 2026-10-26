# Ответы Здравушки, завершение задачи и перевод на сотрудника с заявкой в МИС.

from app import config, journal, safety, ui_texts
from app.dialog import state
from app.dialog.mis import call_mis, identify
from app.dialog.state import LABELS, StandDown
from app.models import ChatResponse, Escalation
from app.dialog.session import Session

# Тексты — из app/ui_texts.py (один источник для бэкенда и фронтенда, см. GET /api/texts)
GREETING = ui_texts.GREETING
GOODBYE = ui_texts.GOODBYE
ANYTHING_ELSE = ui_texts.ANYTHING_ELSE

# Шаги, где пациент вспоминает (ФИО, дата рождения, адрес) и делает паузы — микрофон ждёт дольше
SLOW_STEPS = ("identity", "middle_name", "birth_date", "address", "reason")


def collected(s: Session) -> dict:
    return {LABELS[k]: v for k, v in s.fields.items() if k in LABELS and v}


def reply(s: Session, text: str, status: str | None = None, source: str | None = None,
          explanation: str | None = None, **kw) -> ChatResponse:
    journal.say(s.call, "bot", text)
    s.last_reply = text
    if kw.get("done"):
        s.step = "done"
    if status is None:  # итог реплики для интерфейса: идёт разговор, задача выполнена, передано человеку
        status = "handoff" if kw.get("escalation") else "completed" if kw.get("done") else "in_progress"
    journal.save()
    intent = s.task or s.last_task
    return ChatResponse(session_id=s.id, reply=text, intent=intent,
                        collected=collected(s), status=status, source=source, explanation=explanation,
                        listen_ms=2200 if s.step in SLOW_STEPS else 1300,
                        label=ui_texts.label(status, source, intent, kw.get("booking"), kw.get("escalation")),
                        understood_by=s.understood_by, asr_confidence=s.asr_confidence, **kw)


def finish(s: Session) -> ChatResponse:
    return reply(s, GOODBYE, done=True)


def task_done(s: Session, text: str, result: str, **kw) -> ChatResponse:
    """Задача выполнена: фиксируем результат и спрашиваем, нужно ли что-то ещё."""
    s.call["result"] = result
    s.last_task, s.task, s.step = s.task, None, "more"
    s.forget_task_data()
    kw.setdefault("source", "МИС")
    if kw.get("booking") is not None and kw["booking"].visit_id and "explanation" not in kw:
        kw["explanation"] = f"Действие выполнено в МИС, номер записи {kw['booking'].visit_id}."
    return reply(s, f"{text} {ANYTHING_ELSE}", status="completed", **kw)


async def escalation_client(s: Session) -> dict | None:
    """Клиент для заявки: названный пациент, иначе — технический «Срочный Вызов Иванович»."""
    if s.client:
        return s.client
    c = s.fields
    try:
        if c.get("last_name") and c.get("first_name") and c.get("birth_date"):
            return await identify(s)
        t = config.TECH_CLIENT
        # сначала ищем: карточка технического клиента заводится один раз и дальше переиспользуется
        found = await call_mis(s, "GET", "/clients", state.stand.find_client(t["last_name"], t["first_name"], t["birth_date"]))
        if found:
            return found
        return await call_mis(s, "POST", "/clients", state.stand.create_client(
            t["last_name"], t["first_name"], t["birth_date"], t["middle_name"],
            comment="Технический клиент для срочных заявок без идентификации"))
    except StandDown:
        return None


ESCALATION_MAX = 1000  # ограничение стенда на длину описания заявки


_TASKS: set = set()


def _background(coro):
    import asyncio
    task = asyncio.create_task(coro)
    _TASKS.add(task)
    task.add_done_callback(_TASKS.discard)


def clean_text(text: str, limit: int = ESCALATION_MAX) -> str:
    """Текст для МИС: без управляющих символов и не длиннее лимита стенда."""
    text = "".join(ch if ch.isprintable() or ch == "\n" else " " for ch in text)
    return text if len(text) <= limit else text[:limit - 1] + "…"


async def send_escalation(s: Session, description: str):
    """Заявка на соединение со специалистом в МИС (POST /escalations). Без МИС — только журнал регистратора."""
    if not state.stand:
        return
    client = await escalation_client(s)
    if not client:
        return
    try:
        await call_mis(s, "POST", "/escalations", state.stand.create_escalation(client["id"], clean_text(description)))
    except StandDown:
        pass  # МИС недоступна — перевод всё равно состоится, карточка есть в журнале регистратора


async def escalate(s: Session, esc: Escalation) -> ChatResponse:
    """Перевод на человека: заявка в МИС + карточка в очередь регистратора + фраза из регламента."""
    c = s.fields
    who = journal.mask_name(c.get("last_name"), c.get("first_name"), c.get("middle_name"))
    esc.summary = f"{esc.summary}. Пациент: {who or 'не назван'}. Задача: {s.task or '—'}."
    details = "; ".join(f"{k}: {v}" for k, v in collected(s).items())
    # Первая строка — «ПЕРЕВОД R-xx Pn» (формат организаторов для проверки жюри), дальше — карточка перевода
    description = clean_text(f"ПЕРЕВОД {esc.rule} {esc.priority}\n{esc.reason}. {esc.summary}"
                             + (f" Собрано: {details}." if details else ""))
    # Фраза «звоните 103» не должна ждать стенд: заявка в МИС уходит в фоне (до 3 запросов при общем лимите)
    if config.NOTES_IN_BACKGROUND:
        _background(send_escalation(s, description))
    else:
        await send_escalation(s, description)
    journal.handoff(s.call, esc.reason, esc.priority == "P1", esc.summary, collected(s))
    s.call["result"] = "переведён"
    s.call["intent"] = s.call["intent"] or "перевод на регистратора"
    s.task = "escalation"
    return reply(s, safety.PHRASES.get(esc.rule, safety.PHRASES["R-08"]), escalation=esc, done=True,
                 source="регламент РГ-ТЕЛ-01",
                 explanation=f"Правило {esc.rule} регламента РГ-ТЕЛ-01: {esc.reason}. Обращение передано регистратору.")


def reminder_status(s: Session, status: str, new_time: str | None = None, visit_id: int | None = None):
    """Результат обзвона — в журнал напоминаний (экран «Напоминания» в кабинете).
    visit_id — какую запись изменили; по умолчанию та, о которой напоминаем."""
    vid = visit_id if visit_id is not None else s.reminder_visit_id
    if vid is None or (visit_id is not None and vid not in journal.REMINDERS and vid != s.reminder_visit_id):
        return
    r = journal.REMINDERS.setdefault(vid, {})
    r["status"] = status
    if new_time:
        r["new_time"] = new_time
    journal.save()
