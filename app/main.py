from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app import config, dialog
from app.models import ChatRequest, ChatResponse

app = FastAPI(title=f"{config.ASSISTANT_NAME} — голосовой ассистент регистратуры")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health():
    return {"status": "ok", "assistant": config.ASSISTANT_NAME}


@app.post("/api/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    return await dialog.handle(req.session_id, req.text)


static_dir = Path(__file__).resolve().parent.parent / "static"
if static_dir.exists():
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")