import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from app import ai, config, dialog, journal, schedule, telephony, tts
from app import reminders as reminder_service
from app.models import ChatRequest, ChatResponse

log = logging.getLogger("main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    server = await telephony.start_server() if config.TELEPHONY_ENABLED else None
    yield
    if server:
        server.close()


app = FastAPI(title=f"{config.ASSISTANT_NAME} — голосовой ассистент регистратуры", lifespan=lifespan)

app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.get("/api/health")
async def health():
    return {"status": "ok", "assistant": config.ASSISTANT_NAME,
            "mode": config.STAND_MODE if dialog.state.stand else "no-stand",
            "pd_trusted_ai_only": not config.REJECTED_AI_URLS,
            "llm": bool(config.LLM_URL), "stt": bool(config.STT_URL), "tts": config.TTS_BACKEND,
            "telephony": f"{config.AUDIOSOCKET_HOST}:{config.AUDIOSOCKET_PORT}" if config.TELEPHONY_ENABLED else None}


@app.post("/api/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    try:
        return await dialog.handle(req.session_id, req.text, req.asr_confidence)
    except Exception:
        log.exception("Ошибка диалога")
        return ChatResponse(session_id=req.session_id or "error", reply="Извините, произошёл сбой. "
                            "Соединяю с регистратором.", status="error", done=True)


MAX_AUDIO = 25 * 1024 * 1024


@app.post("/api/asr")
async def asr(file: UploadFile):
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
    try:
        audio = await tts.speak(req.text)
    except Exception as e:
        raise HTTPException(502, f"Синтез речи недоступен: {e}")
    return Response(audio, media_type="audio/wav")


@app.get("/api/doctors")
async def doctors():
    return schedule.public_doctors()


@app.get("/api/live")
async def live_calls():
    return [{**c, "active": True} for c in journal.public(journal.CALLS) if c["id"] in telephony.ACTIVE]

@app.get("/api/calls")
async def calls():
    return journal.public(journal.CALLS)


@app.get("/api/handoffs")
async def handoffs():
    return journal.public(journal.HANDOFFS)


class HandoffUpdate(BaseModel):
    status: str


@app.patch("/api/handoffs/{handoff_id}")
async def update_handoff(handoff_id: str, body: HandoffUpdate):
    try:
        return journal.set_handoff_status(handoff_id, body.status)
    except KeyError:
        raise HTTPException(404, "Перевод не найден")
    except ValueError:
        raise HTTPException(400, "Недопустимый статус")


@app.get("/api/reminders")
async def reminders():
    try:
        return await reminder_service.reminder_rows()
    except reminder_service.MisUnavailable as e:
        raise HTTPException(503, f"МИС недоступна: {e}")


@app.post("/api/reminders/run")
async def run_reminders():
    try:
        queued = await reminder_service.start_campaign()
    except reminder_service.MisUnavailable as e:
        raise HTTPException(503, f"МИС недоступна: {e}")
    return {"queued": 0, "note": "обзвон уже идёт"} if queued is None else {"queued": queued}


@app.post("/api/reminders/{visit_id}/call")
async def call_one(visit_id: int):
    try:
        await reminder_service.call_one(visit_id)
    except reminder_service.MisUnavailable as e:
        raise HTTPException(503, f"МИС недоступна: {e}")
    except reminder_service.VisitNotFound:
        raise HTTPException(404, "Запись не найдена или уже прошла")
    except reminder_service.Busy:
        raise HTTPException(409, "Сейчас идёт другой звонок")
    return {"queued": 1}


static_dir = Path(__file__).resolve().parent.parent / "static"
if static_dir.exists():
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")
