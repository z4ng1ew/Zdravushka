import json
import logging
import os
import uuid
from pathlib import Path

from app import schedule

log = logging.getLogger("journal")
FILE = Path(__file__).resolve().parent.parent / "data" / "runtime" / "journal.json"

CALLS: dict[str, dict] = {}
HANDOFFS: dict[str, dict] = {}
REMINDERS: dict[int, dict] = {}


def _load():
    if FILE.exists():
        try:
            data = json.loads(FILE.read_text(encoding="utf-8"))
        except (OSError, ValueError) as e:
            log.warning("журнал не прочитан: %s", e)
            return
        CALLS.update(data.get("calls", {}))
        HANDOFFS.update(data.get("handoffs", {}))
        REMINDERS.update({int(k): v for k, v in data.get("reminders", {}).items()})


def save():
    try:
        FILE.parent.mkdir(parents=True, exist_ok=True)
        tmp = FILE.with_suffix(".tmp")
        tmp.write_text(json.dumps({"calls": CALLS, "handoffs": HANDOFFS, "reminders": REMINDERS},
                                  ensure_ascii=False), encoding="utf-8")
        os.replace(tmp, FILE)
    except OSError as e:
        log.warning("журнал не сохранён: %s", e)


def mask_name(last: str | None, first: str | None, middle: str | None = None) -> str | None:
    if not last:
        return None
    initials = " ".join(f"{p[0]}." for p in (first, middle) if p)
    return f"{last} {initials}".strip()


def now_str() -> str:
    return schedule.now().strftime("%d.%m.%Y %H:%M")


def start_call(call_id: str, direction: str = "входящий") -> dict:
    call = {"id": call_id, "direction": direction, "started_at": now_str(), "duration_sec": 0,
            "intent": "", "result": "сброшен", "patient": None, "transcript": [], "stand_requests": [],
            "_t0": schedule.now().timestamp()}
    CALLS[call_id] = call
    return call


def say(call: dict, speaker: str, text: str):
    call["transcript"].append({"speaker": speaker, "text": text, "at": schedule.now().strftime("%H:%M:%S")})
    call["duration_sec"] = int(schedule.now().timestamp() - call["_t0"])


def stand_request(call: dict, method: str, path: str, status: int, note: str = ""):
    call["stand_requests"].append({"method": method, "path": path, "status": status, "note": note})


def handoff(call: dict, reason: str, urgent: bool, summary: str, collected: dict) -> dict:
    h = {"id": uuid.uuid4().hex[:8], "call_id": call["id"], "created_at": now_str(), "reason": reason,
         "urgent": urgent, "status": "новая", "phone": "+7 *** ***-**-**", "summary": summary,
         "collected": {k: str(v) for k, v in collected.items()}, "transcript": list(call["transcript"])}
    HANDOFFS[h["id"]] = h
    save()
    return h


HANDOFF_STATUSES = ("новая", "в работе", "перезвонили", "закрыта")


def set_handoff_status(handoff_id: str, status: str) -> dict:
    if handoff_id not in HANDOFFS:
        raise KeyError(handoff_id)
    if status not in HANDOFF_STATUSES:
        raise ValueError(status)
    HANDOFFS[handoff_id]["status"] = status
    save()
    return HANDOFFS[handoff_id]


def public(items: dict) -> list[dict]:
    out = [{k: v for k, v in item.items() if not k.startswith("_")} for item in items.values()]
    return list(reversed(out))


_load()
