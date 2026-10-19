import re
from collections.abc import Awaitable, Callable

from app import safety
from app.dialog.common import escalate, reply
from app.dialog.session import Session
from app.models import ChatResponse, Escalation

Guard = Callable[[Session, str], Awaitable[ChatResponse | None]]

WHICH_DOCTORS = re.compile(r"какие (у вас )?(есть )?(врач|специалист|доктор)|каких врачей|какие врачи")


async def red_flags(s: Session, text: str) -> ChatResponse | None:
    esc = safety.check(text)
    return await escalate(s, esc) if esc else None


async def hard_of_hearing(s: Session, text: str) -> ChatResponse | None:
    if not (safety.asks_repeat(text) and s.last_reply):
        return None
    s.repeats += 1
    if s.repeats >= 2:
        return await escalate(s, Escalation(rule="R-15", reason="не распознано", priority="P2",
                                            summary="Пациент плохо слышит ассистента"))
    last = s.last_reply
    resp = reply(s, f"Повторяю. {last}", options=[])
    s.last_reply = last
    return resp


async def which_doctors(s: Session, text: str) -> ChatResponse | None:
    if not WHICH_DOCTORS.search(text.lower()):
        return None
    s.step = "specialty"
    s.task = s.task or "booking"
    return reply(s, "У нас принимают терапевты, педиатры, офтальмологи, лор, неврологи, кардиологи, хирурги, "
                    "гинекологи, стоматологи и другие специалисты. К какому врачу записать?")


GUARDS: list[Guard] = [red_flags, hard_of_hearing, which_doctors]


async def run_guards(s: Session, text: str) -> ChatResponse | None:
    for guard in GUARDS:
        if (resp := await guard(s, text)):
            return resp
    return None
