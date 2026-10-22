# Реакции на намерения, которые прерывают любой сценарий: угроза жизни, оператор, жалоба,
# медицинский вопрос, прощание. Новое правило = новая функция в INTERCEPTORS.
import re

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
    # «Спасибо, мне ничего не надо. Пока.» посреди записи — прощаемся, а не предлагаем время снова (живой звонок 22.10)
    if re.search(r"(^|[.,!?]\s*)пока[.!]*$|\b(до свидания|всего доброго)\b", s.text.strip()) or "ничего не надо" in s.text or "ничего не нужно" in s.text:
        return finish(s)
    if s.step in ("confirm", "choose_slot") and re.search(r"\b(не надо|не нужно|передумал|передумала|не записывайте)\b", s.text):
        s.task, s.step = None, "more"
        s.forget_task_data()
        return reply(s, "Хорошо, не записываю. Могу ещё чем-то помочь?")
    return None


async def side_question(s: Session, nl: dict, text: str) -> ChatResponse | None:
    """Справочный вопрос посреди сценария («где вы находитесь?» при выборе времени):
    отвечаем по регламенту и возвращаемся к прерванному вопросу, не теряя записи."""
    from app import knowledge
    if not (s.task and s.task != "info" and nl["intent"] == "info" and nl["topic"]):
        return None
    if s.step in ("identity", "middle_name", "birth_date", "address", "reason") or nl["address"] or nl["last_name"]:
        return None  # пациент отвечает на вопрос («…адрес: улица Ленина»), а не спрашивает справку
    answer = knowledge.answer(nl["topic"])
    if not answer or not s.last_reply:
        return None
    return reply(s, f"{answer} Вернёмся к записи: {s.last_reply}", options=s.options or [],
                 source="регламент РГ-ТЕЛ-01", explanation=f"Ответ из базы знаний регламента, тема: {nl['topic']}.")


async def other_person(s: Session, nl: dict, text: str) -> ChatResponse | None:
    """«Хочу за другого человека / за маму» — забываем названного пациента и спрашиваем данные заново."""
    import re
    if not re.search(r"друго(го|й) человек|за (маму|папу|мать|отца|сына|дочь|жену|мужа|ребенка|ребёнка|бабушку|дедушку)", s.text):
        return None
    s.client = None
    for key in ("last_name", "first_name", "middle_name", "birth_date", "_no_middle", "_birth_dm", "_birth_year"):
        s.fields.pop(key, None)
    s.id_attempts = 0
    if s.step == "more":
        s.step = "start"
    return None  # дальше сценарий спросит ФИО и дату рождения другого пациента


INTERCEPTORS: list[Interceptor] = [emergency, operator, complaint, medical, other_person, side_question, goodbye]


async def run_interceptors(s: Session, nl: dict, text: str) -> ChatResponse | None:
    for rule in INTERCEPTORS:
        if (resp := await rule(s, nl, text)):
            return resp
    return None
