
from app import config, journal, safety
from app.dialog import state
from app.dialog.mis import call_mis, identify
from app.dialog.state import LABELS, StandDown
from app.models import ChatResponse, Escalation

GREETING = (f"Здравствуйте! Я {config.ASSISTANT_NAME}, виртуальный помощник регистратуры "
            "поликлиники номер семь. Разговор записывается. Чем могу помочь?")


GOODBYE = "Всего доброго, будьте здоровы!"


ANYTHING_ELSE = "Могу ещё чем-то помочь?"


def collected(s: dict) -> dict:
    return {LABELS[k]: v for k, v in s["c"].items() if k in LABELS and v}


def reply(s: dict, text: str, status: str | None = None, source: str | None = None, **kw) -> ChatResponse:
    journal.say(s["call"], "bot", text)
    s["last_reply"] = text
    if kw.get("done"):
        s["step"] = "done"
    if status is None:
        status = "handoff" if kw.get("escalation") else "completed" if kw.get("done") else "in_progress"
    journal.save()
    return ChatResponse(session_id=s["id"], reply=text, intent=s.get("task") or s.get("last_task"),
                        collected=collected(s), status=status, source=source, **kw)


def finish(s: dict) -> ChatResponse:
    return reply(s, GOODBYE, done=True)


def task_done(s: dict, text: str, result: str, **kw) -> ChatResponse:
    s["call"]["result"] = result
    s["last_task"], s["task"], s["step"] = s["task"], None, "more"
    for key in ("options", "visits", "visit", "chosen"):
        s.pop(key, None)
    kw.setdefault("source", "МИС")
    return reply(s, f"{text} {ANYTHING_ELSE}", status="completed", **kw)


async def escalation_client(s: dict) -> dict | None:
    if s.get("client"):
        return s["client"]
    c = s["c"]
    try:
        if c.get("last_name") and c.get("first_name") and c.get("birth_date"):
            return await identify(s)
        t = config.TECH_CLIENT
        found = await call_mis(s, "GET", "/clients", state.stand.find_client(t["last_name"], t["first_name"], t["birth_date"]))
        if found:
            return found
        return await call_mis(s, "POST", "/clients", state.stand.create_client(
            t["last_name"], t["first_name"], t["birth_date"], t["middle_name"],
            comment="Технический клиент для срочных заявок без идентификации"))
    except StandDown:
        return None


async def send_escalation(s: dict, description: str):
    if not state.stand:
        return
    client = await escalation_client(s)
    if not client:
        return
    try:
        await call_mis(s, "POST", "/escalations", state.stand.create_escalation(client["id"], description))
    except StandDown:
        pass


async def escalate(s: dict, esc: Escalation) -> ChatResponse:
    c = s["c"]
    who = journal.mask_name(c.get("last_name"), c.get("first_name"), c.get("middle_name"))
    esc.summary = f"{esc.summary}. Пациент: {who or 'не назван'}. Задача: {s.get('task') or '—'}."
    details = "; ".join(f"{k}: {v}" for k, v in collected(s).items())
    await send_escalation(s, f"[{esc.rule}, {esc.priority}] {esc.reason}. {esc.summary}"
                              + (f" Собрано: {details}." if details else ""))
    journal.handoff(s["call"], esc.reason, esc.priority == "P1", esc.summary, collected(s))
    s["call"]["result"] = "переведён"
    s["call"]["intent"] = s["call"]["intent"] or "перевод на регистратора"
    s["task"] = "escalation"
    return reply(s, safety.PHRASES.get(esc.rule, safety.PHRASES["R-08"]), escalation=esc, done=True,
                  source="регламент РГ-ТЕЛ-01")


def reminder_status(s: dict, status: str, new_time: str | None = None, visit_id: int | None = None):
    vid = visit_id if visit_id is not None else s.get("reminder_visit_id")
    if vid is None or (visit_id is not None and vid not in journal.REMINDERS and vid != s.get("reminder_visit_id")):
        return
    r = journal.REMINDERS.setdefault(vid, {})
    r["status"] = status
    if new_time:
        r["new_time"] = new_time
    journal.save()
