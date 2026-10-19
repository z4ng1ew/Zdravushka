import re
from collections.abc import Awaitable, Callable

from app import config, safety
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


async def prompt_injection(s: Session, text: str) -> ChatResponse | None:
    if not safety.is_injection(text):
        return None
    flags = s.call.setdefault("flags", [])
    if "prompt_injection" not in flags:
        flags.append("prompt_injection")
    s.miss += 1
    if s.miss >= 3:
        return await escalate(s, Escalation(rule="R-05", reason="не распознано", priority="P3",
                                            summary="Повторные попытки изменить поведение ассистента"))
    return reply(s, "Я помогаю только с записью к врачу и вопросами регистратуры: записать, перенести, "
                    "отменить приём, подсказать график. Чем могу помочь?",
                 explanation="Фраза похожа на попытку изменить правила ассистента — она не выполняется.")


IMPORTANT_STEPS = ("identity", "birth_date", "confirm", "confirm_all", "address")


async def unsure_hearing(s: Session, text: str) -> ChatResponse | None:
    conf = s.asr_confidence
    if conf is None or conf >= config.ASR_MIN_CONFIDENCE or s.step not in IMPORTANT_STEPS:
        return None
    s.unsure += 1
    if s.unsure >= 3:
        return await escalate(s, Escalation(rule="R-15", reason="не распознано", priority="P2",
                                            summary="Речь пациента плохо распознаётся"))
    return reply(s, f"Простите, плохо расслышала. Вы сказали: «{text}»? Повторите, пожалуйста, чуть медленнее.",
                 explanation=f"Уверенность распознавания {conf:.0%} ниже порога — переспрашиваем.")


GUARDS: list[Guard] = [red_flags, prompt_injection, unsure_hearing, hard_of_hearing, which_doctors]


async def run_guards(s: Session, text: str) -> ChatResponse | None:
    for guard in GUARDS:
        if (resp := await guard(s, text)):
            return resp
    return None
