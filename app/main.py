# Сервер Здравушки. Запуск: uvicorn app.main:app --reload --port 8000
# Документация API для фронтенда: http://localhost:8000/docs
import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from app import ai, config, dialog, journal, schedule, telephony, tts, ui_texts
from app import reminders as reminder_service
from app.models import ChatRequest, ChatResponse

log = logging.getLogger("main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """При старте сервера поднимаем мост телефонии (AudioSocket для Asterisk)."""
    server = await telephony.start_server() if config.TELEPHONY_ENABLED else None
    warm = asyncio.create_task(tts.warm_up())  # Silero грузится в фоне, сервер отвечает сразу
    yield
    warm.cancel()
    if server:
        server.close()


app = FastAPI(title=f"{config.ASSISTANT_NAME} — голосовой ассистент регистратуры", lifespan=lifespan)

# CORS: фронтенд на другом порту (npm run dev, :3000) может обращаться к API
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.get("/api/health")
async def health():
    """Проверка, что сервер жив, и в каком режиме работает."""
    return {"status": "ok", "assistant": config.ASSISTANT_NAME,
            "mode": config.STAND_MODE if dialog.state.stand else "no-stand",
            "pd_trusted_ai_only": not config.REJECTED_AI_URLS,
            "llm": bool(config.LLM_URL), "stt": bool(config.STT_URL), "tts": config.TTS_BACKEND,
            "telephony": f"{config.AUDIOSOCKET_HOST}:{config.AUDIOSOCKET_PORT}" if config.TELEPHONY_ENABLED else None}


@app.get("/api/texts")
async def texts():
    """Приветствие, имя ассистента и подсказки интерфейса — единственный источник текстов (app/ui_texts.py)."""
    return ui_texts.public()


# ---------- Разговор ----------

@app.post("/api/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    """Реплика пациента → ответ Здравушки. Новый звонок: {"session_id": null, "text": ""}."""
    try:
        return await dialog.handle(req.session_id, req.text, req.asr_confidence)
    except Exception:  # непредвиденный сбой — пациент слышит понятную фразу, а не ошибку 500
        log.exception("Ошибка диалога")
        return ChatResponse(session_id=req.session_id or "error", reply=ui_texts.HINTS["error"],
                            status="error", label=ui_texts.label("error", None, None, None, None), done=True)


MAX_AUDIO = 25 * 1024 * 1024  # ограничение шлюза распознавания


@app.post("/api/asr")
async def asr(file: UploadFile):
    """Распознавание речи: аудиофайл → {text, confidence}."""
    audio = await file.read(MAX_AUDIO + 1)
    if len(audio) > MAX_AUDIO:
        raise HTTPException(413, "Аудио больше 25 МБ — ограничение шлюза распознавания")
    try:
        text, confidence = await ai.transcribe(audio, file.filename or "speech.webm")
    except ai.AIError as e:
        raise HTTPException(502, f"Распознавание недоступно: {e}")
    return {"text": text, "confidence": confidence}


class TtsRequest(BaseModel):
    text: str


@app.post("/api/tts")
async def speak(req: TtsRequest):
    """Синтез речи: {text} → audio/wav."""
    try:
        audio = await tts.speak(req.text)
    except Exception as e:  # синтезатор не настроен или упал — фронт покажет текст без звука
        raise HTTPException(502, f"Синтез речи недоступен: {e}")
    return Response(audio, media_type="audio/wav")


# ---------- Кабинет сотрудника ----------

@app.get("/api/doctors")
async def doctors():
    """Справочник врачей и недельные графики (из расписания поликлиники, без обращения к МИС)."""
    return schedule.public_doctors()


@app.get("/api/live")
async def live_calls():
    """Телефонные звонки, которые идут прямо сейчас (с расшифровкой) — экран «Звонок сейчас»."""
    return [{**c, "active": True} for c in journal.public(journal.CALLS) if c["id"] in telephony.ACTIVE]

@app.get("/api/calls")
async def calls():
    """Журнал звонков: расшифровка, результат, запросы к стенду."""
    return journal.public(journal.CALLS)


@app.get("/api/handoffs")
async def handoffs():
    """Очередь переводов на регистратора."""
    return journal.public(journal.HANDOFFS)


class HandoffUpdate(BaseModel):
    status: str


@app.patch("/api/handoffs/{handoff_id}")
async def update_handoff(handoff_id: str, body: HandoffUpdate):
    """Регистратор меняет статус перевода: новая → в работе → перезвонили → закрыта."""
    try:
        return journal.set_handoff_status(handoff_id, body.status)
    except KeyError:
        raise HTTPException(404, "Перевод не найден")
    except ValueError:
        raise HTTPException(400, "Недопустимый статус")


@app.get("/api/reminders")
async def reminders():
    """Список напоминаний на следующий рабочий день со статусами обзвона."""
    try:
        return await reminder_service.reminder_rows()
    except reminder_service.MisUnavailable as e:
        raise HTTPException(503, f"МИС недоступна: {e}")


@app.post("/api/reminders/run")
async def run_reminders():
    """Обзвон пациентов, записанных на следующий рабочий день (С-10). Звонки идут в фоне."""
    try:
        queued = await reminder_service.start_campaign()
    except reminder_service.MisUnavailable as e:
        raise HTTPException(503, f"МИС недоступна: {e}")
    except reminder_service.OutsideWindow:
        return {"queued": 0, "note": "вне окна обзвона С-10: будни 10:00–19:00, суббота 10:00–15:00 (демо: REMINDER_DEMO=1)"}
    return {"queued": 0, "note": "обзвон уже идёт"} if queued is None else {"queued": queued}


@app.post("/api/reminders/{visit_id}/call")
async def call_one(visit_id: int):
    """Позвонить с напоминанием по одной записи — для демонстрации."""
    try:
        await reminder_service.call_one(visit_id)
    except reminder_service.MisUnavailable as e:
        raise HTTPException(503, f"МИС недоступна: {e}")
    except reminder_service.VisitNotFound:
        raise HTTPException(404, "Запись не найдена или уже прошла")
    except reminder_service.Busy:
        raise HTTPException(409, "Сейчас идёт другой звонок")
    return {"queued": 1}


# Фронтенд из папки static/ — по адресу http://localhost:8000/ (подключается последним)
static_dir = Path(__file__).resolve().parent.parent / "static"
if static_dir.exists():
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")
