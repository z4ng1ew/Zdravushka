from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from app import ai, config, dialog, journal, schedule, telephony, tts
from app.models import ChatRequest, ChatResponse


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
            "mode": "stand" if dialog.stand else "demo",
            "llm": bool(config.LLM_URL), "stt": bool(config.STT_URL), "tts": config.TTS_BACKEND,
            "telephony": f"{config.AUDIOSOCKET_HOST}:{config.AUDIOSOCKET_PORT}" if config.TELEPHONY_ENABLED else None}


@app.post("/api/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    return await dialog.handle(req.session_id, req.text)


@app.post("/api/asr")
async def asr(file: UploadFile):
    audio = await file.read()
    try:
        text = await ai.speech_to_text(audio, file.filename or "speech.webm")
    except ai.AIError as e:
        raise HTTPException(502, f"Распознавание недоступно: {e}")
    return {"text": text, "confidence": None}


class TtsRequest(BaseModel):
    text: str


@app.post("/api/tts")
async def speak(req: TtsRequest):
    try:
        audio = await tts.speak(req.text)
    except Exception as e:
        raise HTTPException(502, f"Синтез речи недоступен: {e}")
    return Response(audio, media_type="audio/wav")


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
    if handoff_id not in journal.HANDOFFS:
        raise HTTPException(404, "Перевод не найден")
    if body.status not in ("новая", "в работе", "перезвонили", "закрыта"):
        raise HTTPException(400, "Недопустимый статус")
    journal.HANDOFFS[handoff_id]["status"] = body.status
    journal.save()
    return journal.HANDOFFS[handoff_id]


async def _tomorrow_visits() -> list[dict]:
    day = schedule.now().date()
    while True:
        day = day.fromordinal(day.toordinal() + 1)
        if day.weekday() != 6:
            break
    d = day.strftime("%d.%m.%Y")
    if dialog.stand:
        return await dialog.stand.list_visits(status="Запланирована", date_from=d, date_to=d)
    return [v for v in dialog.DEMO_VISITS.values()
            if v["status"] == "Запланирована" and v["scheduled_at"].startswith(d)]


@app.get("/api/reminders")
async def reminders():
    result = []
    for v in await _tomorrow_visits():
        r = journal.REMINDERS.setdefault(v["id"], {"status": "ожидает"})
        result.append({"visit_id": v["id"], "patient": f"пациент № {v['client_id']}",
                       "doctor": v["doctor"]["full_name"], "specialty": v["doctor"]["specialty"],
                       "scheduled_at": v["scheduled_at"], "status": r["status"], "new_time": r.get("new_time")})
    return result


@app.post("/api/reminders/run")
async def run_reminders():
    queued = 0
    for v in await _tomorrow_visits():
        r = journal.REMINDERS.setdefault(v["id"], {"status": "ожидает"})
        if r["status"] == "ожидает":
            r["status"] = "звоним"
            queued += 1
    journal.save()
    return {"queued": queued}


static_dir = Path(__file__).resolve().parent.parent / "static"
if static_dir.exists():
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")
