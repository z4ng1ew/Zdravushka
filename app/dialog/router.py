# Главная функция разговора. Только порядок шагов — каждый шаг живёт в своём модуле:
#   guards.py       — проверки до нейросети (красные флаги, «повторите», «какие врачи»)
#   understanding.py — понимание фразы с учётом текущего вопроса
#   interceptors.py  — намерения, прерывающие сценарий (103, оператор, жалоба, медвопрос, прощание)
#   HANDLERS         — сценарии регламента (запись, перенос, отмена, …)
import uuid

import httpx

from app import journal
from app.dialog.booking import task_booking
from app.dialog.common import GREETING, collected, escalate, reply
from app.dialog.mis import flush_notes
from app.dialog.guards import run_guards
from app.dialog.info import task_home_visit, task_info, task_schedule_info
from app.dialog.interceptors import run_interceptors
from app.dialog.reminder import task_reminder
from app.dialog.session import Session
from app.dialog.state import SESSIONS, TASKS, StandDown, open_session
from app.dialog.understanding import forget_task_details, interpret, remember
from app.dialog.visits import task_cancel, task_reschedule, task_status
from app.models import ChatResponse, Escalation
from app.stand_client import StandError

# Сценарий → обработчик. Новый сценарий = новый модуль + одна строка здесь.
HANDLERS = {"reminder": task_reminder, "booking": task_booking, "reschedule": task_reschedule, "cancel": task_cancel,
            "status": task_status, "schedule_info": task_schedule_info, "info": task_info,
            "home_visit": task_home_visit}

HIDDEN_STEPS = ("identity", "middle_name", "birth_date", "address")  # на этих шагах пациент называет ФИО и дату рождения


async def handle(session_id: str | None, text: str, asr_confidence: float | None = None) -> ChatResponse:
    """Одна реплика пациента → ответ ассистента. asr_confidence — уверенность распознавания (если голосом)."""
    text = text.strip()
    s = SESSIONS.get(session_id) if session_id else None
    if s is None:  # новый разговор
        s = open_session(session_id or uuid.uuid4().hex[:12])
        if not text:
            return reply(s, GREETING)
    if s.step == "done":
        return ChatResponse(session_id=s.id, reply="Разговор завершён. Чтобы начать заново, позвоните ещё раз.",
                            done=True, collected=collected(s))
    if not text:
        return reply(s, "Вы меня слышите?")
    _log_patient(s, text)
    s.asr_confidence, s.understood_by = asr_confidence, None

    if (resp := await run_guards(s, text)):
        return resp
    nl = await interpret(s, text)
    s.understood_by = nl.get("_source")
    if (resp := await run_interceptors(s, nl, text)):
        return resp
    _select_task(s, nl)
    remember(s, nl)
    if not s.task:
        return await _not_understood(s, nl)
    s.miss = 0
    before = s.last_reply
    resp = await _run_task(s, nl)
    return await _break_loop(s, before, resp)


async def _break_loop(s: Session, before: str, resp: ChatResponse) -> ChatResponse:
    """Защита от зацикливания (найдено на живых звонках: «Скажите номер варианта…» по кругу).
    Тот же вопрос третий раз подряд — переводим на регистратора (R-05), а не мучаем пациента."""
    if resp.done or resp.escalation or resp.reply != before:
        s.loop = 0
        return resp
    s.loop += 1
    if s.loop >= 2:
        return await escalate(s, Escalation(rule="R-05", reason="не распознано", priority="P3",
                                            summary=f"Ассистент трижды повторил вопрос: «{before[:120]}»"))
    return resp


def _log_patient(s: Session, text: str):
    """Реплика в расшифровку. 152-ФЗ: ФИО и дату рождения храним только в МИС, не в журнале."""
    journal.say(s.call, "patient", ("[адрес — скрыто]" if s.step == "address" else "[ФИО и дата рождения — скрыто]") if s.step in HIDDEN_STEPS else text)
    s.text = text.lower()


def _select_task(s: Session, nl: dict):
    """Новая задача или продолжение текущей."""
    intent = nl["intent"]
    if intent in TASKS and (not s.task or s.step in ("start", "more", "specialty")):
        if intent != s.task or s.step == "more":
            forget_task_details(s)
        s.task = intent
        if s.step in ("start", "more"):
            s.step = "start"
    elif not s.task and (nl["specialty"] or nl["doctor_name"]) and intent in (None, "other", "info"):
        s.task = "booking"  # «Меня к хирургу» — без слова «запишите», но смысл ясен
    elif s.step == "choose_slot" and nl["specialty"] and nl["specialty"] != s.fields.get("specialty"):
        forget_task_details(s)  # посреди выбора времени попросили другого врача («хочу к педиатру»)
        s.task, s.step = "booking", "start"


async def _not_understood(s: Session, nl: dict) -> ChatResponse:
    """Задача не ясна: подсказка, потом предложение оператора, на третий раз — перевод (R-05)."""
    s.miss += 1
    if s.miss >= 3:
        return await escalate(s, Escalation(rule="R-05", reason="не распознано", priority="P3",
                                            summary="Ассистент трижды не понял пациента"))
    if s.miss == 2:
        return reply(s, "Простите, не поняла. Могу соединить с сотрудником, или скажите иначе: "
                        "записаться, перенести или отменить запись?")
    return reply(s, "Я могу записать к врачу, перенести или отменить запись, вызвать врача на дом "
                    "или подсказать график. Что нужно?")


async def _run_task(s: Session, nl: dict) -> ChatResponse:
    """Выполнение сценария. Любой сбой МИС → перевод на регистратора (R-06)."""
    try:
        return await HANDLERS[s.task](s, nl)
    except (StandDown, StandError, httpx.HTTPError) as e:
        return await escalate(s, Escalation(rule="R-06", reason="сбой МИС", priority="P2", summary=f"Сбой МИС: {e}"))
    finally:
        await flush_notes(s)  # отметки SMS / подтверждения — в комментарий клиента одним PATCH
