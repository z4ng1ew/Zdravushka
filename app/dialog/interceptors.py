# Реакции на намерения, которые прерывают любой сценарий: угроза жизни, оператор, жалоба,
# медицинский вопрос, прощание. Новое правило = новая функция в INTERCEPTORS.
from collections.abc import Awaitable, Callable

from app.dialog.common import escalate, finish, reply
from app.dialog.session import Session
from app.dialog.state import TASKS
from app.models import ChatResponse, Escalation

Interceptor = Callable[[Session, dict, str], Awaitable[ChatResponse | None]]


async def emergency(s: Session, nl: dict, text: str) -> ChatResponse | None:
    if nl["intent"] != "emergency":
        return None
    return await escalate(s, Escalation(rule="R-01", reason="неотложное состояние", priority="P1",
                                        emergency=True, summary=f"Возможная угроза жизни: «{text}»"))


async def operator(s: Session, nl: dict, text: str) -> ChatResponse | None:
    if nl["intent"] != "operator":
        return None
    return await escalate(s, Escalation(rule="R-02", reason="просьба оператора", priority="P2",
                                        summary="Пациент попросил сотрудника"))


async def complaint(s: Session, nl: dict, text: str) -> ChatResponse | None:
    if nl["intent"] != "complaint":
        return None
    return await escalate(s, Escalation(rule="R-03", reason="жалоба", priority="P2", summary=f"Жалоба: «{text}»"))


async def medical(s: Session, nl: dict, text: str) -> ChatResponse | None:
    """Медицинских советов не даём: первый раз — предупреждаем, второй — переводим (R-04)."""
    if nl["intent"] != "medical":
        return None
    if s.medical_warned:
        return await escalate(s, Escalation(rule="R-04", reason="медицинский вопрос", priority="P3",
                                            summary=f"Медицинский вопрос: «{text}»"))
    s.medical_warned = True
    return reply(s, "Я не могу давать медицинские советы — это может сделать только врач. "
                    "Давайте я запишу вас на приём к терапевту. Если состояние резко ухудшилось, звоните сто три.")


async def goodbye(s: Session, nl: dict, text: str) -> ChatResponse | None:
    intent = nl["intent"]
    nothing = s.text.startswith("ничего") or "ничего не нужно" in s.text or "больше ничего" in s.text
    if s.step == "more" and (intent == "goodbye" or nothing or (nl["answer"] == "no" and intent not in TASKS)):
        return finish(s)
    if intent == "goodbye" and not s.task:
        return finish(s)
    return None


INTERCEPTORS: list[Interceptor] = [emergency, operator, complaint, medical, goodbye]


async def run_interceptors(s: Session, nl: dict, text: str) -> ChatResponse | None:
    for rule in INTERCEPTORS:
        if (resp := await rule(s, nl, text)):
            return resp
    return None
