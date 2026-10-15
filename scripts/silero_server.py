import io
import os
import wave

import numpy as np
import torch
import uvicorn
from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

TOKEN = os.getenv("SILERO_TOKEN", "")
MODEL_ID = os.getenv("SILERO_MODEL", "v5_ru")
DEFAULT_VOICE = os.getenv("SILERO_VOICE", "baya")
SAMPLE_RATE = int(os.getenv("SILERO_RATE", "24000"))
PORT = int(os.getenv("SILERO_PORT", "8020"))

torch.set_num_threads(int(os.getenv("SILERO_THREADS", "4")))


def load_model():
    for model_id in (MODEL_ID, "v4_ru"):
        try:
            model, _ = torch.hub.load("snakers4/silero-models", "silero_tts",
                                      language="ru", speaker=model_id, trust_repo=True)
            print(f"Silero загружена: {model_id}")
            return model
        except Exception as e:
            print(f"Не удалось загрузить {model_id}: {e}")
    raise SystemExit("Silero не загрузилась")


model = load_model()
app = FastAPI(title="Silero TTS для Здравушки")


class SpeechRequest(BaseModel):
    input: str
    voice: str | None = None
    model: str | None = None
    response_format: str | None = "wav"


def to_wav(audio: torch.Tensor) -> bytes:
    pcm = (audio.numpy() * 32767).clip(-32768, 32767).astype(np.int16)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SAMPLE_RATE)
        w.writeframes(pcm.tobytes())
    return buf.getvalue()


@app.post("/v1/audio/speech")
def speech(req: SpeechRequest, authorization: str = Header(default="")):
    if TOKEN and authorization != f"Bearer {TOKEN}":
        raise HTTPException(401, "Неверный токен")
    text = req.input.strip()
    if not text:
        raise HTTPException(400, "Пустой текст")
    voice = req.voice or DEFAULT_VOICE
    audio = model.apply_tts(text=text[:900], speaker=voice, sample_rate=SAMPLE_RATE,
                            put_accent=True, put_yo=True)
    return Response(to_wav(audio), media_type="audio/wav")


@app.get("/v1/models")
def models():
    return {"data": [{"id": f"silero-{MODEL_ID}"}]}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=PORT)
