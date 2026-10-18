import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from app import ai, config, dialog, journal, schedule, telephony, tts
from app.models import ChatRequest, ChatResponse
from app.stand_client import StandError

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
        return await dialog.handle(req.session_id, req.text)
    except Exception:
        log.exception("Ошибка диалога")
        return ChatResponse(session_id=req.session_id or "error", reply="Извините, произошёл сбой. "
                            "Соединяю с регистратором.", status="error", done=True)


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
    if not dialog.state.stand:
        return []
    try:
        return await dialog.state.stand.list_visits(status="Запланирована", date_from=d, date_to=d)
    except (StandError, httpx.HTTPError) as e:
        raise HTTPException(503, f"МИС недоступна: {e}")


@app.get("/api/reminders")
async def reminders():
    result = []
    for v in await _tomorrow_visits():
        r = journal.REMINDERS.setdefault(v["id"], {"status": "ожидает"})
        result.append({"visit_id": v["id"], "patient": f"пациент № {v['client_id']}",
                       "doctor": v["doctor"]["full_name"], "specialty": v["doctor"]["specialty"],
                       "scheduled_at": v["scheduled_at"], "status": r["status"], "new_time": r.get("new_time")})
    return result


async def _ring_all(visits: list[dict]):
    for v in visits:
        outcome = await telephony.call_reminder(v)
        r = journal.REMINDERS.setdefault(v["id"], {})
        if outcome in ("не дозвонились", "ошибка звонка") or r.get("status") in (None, "ожидает", "звоним"):
            r["status"] = outcome if outcome != "звонок завершён" else "без ответа"
        journal.save()


@app.post("/api/reminders/run")
async def run_reminders():
    if RINGING["task"] and not RINGING["task"].done():
        return {"queued": 0, "note": "обзвон уже идёт"}
    visits = [v for v in await _tomorrow_visits()
              if journal.REMINDERS.setdefault(v["id"], {"status": "ожидает"})["status"] in ("ожидает", "не дозвонились")]
    for v in visits:
        journal.REMINDERS[v["id"]]["status"] = "в очереди"
    journal.save()
    RINGING["task"] = asyncio.create_task(_ring_all(visits))
    return {"queued": len(visits)}


@app.post("/api/reminders/{visit_id}/call")
async def call_one(visit_id: int):
    visits = [v for v in await _visits_from_tomorrow() if v["id"] == visit_id]
    if not visits:
        raise HTTPException(404, "Запись не найдена или уже прошла")
    if RINGING["task"] and not RINGING["task"].done():
        raise HTTPException(409, "Сейчас идёт другой звонок")
    RINGING["task"] = asyncio.create_task(_ring_all(visits))
    return {"queued": 1}


async def _visits_from_tomorrow() -> list[dict]:
    if not dialog.state.stand:
        return []
    try:
        visits = await dialog.state.stand.list_visits(status="Запланирована")
    except (StandError, httpx.HTTPError) as e:
        raise HTTPException(503, f"МИС недоступна: {e}")
    now = schedule.now()
    return [v for v in visits if schedule.from_api(v["scheduled_at"]) > now]


RINGING: dict = {"task": None}


static_dir = Path(__file__).resolve().parent.parent / "static"
if static_dir.exists():
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")
