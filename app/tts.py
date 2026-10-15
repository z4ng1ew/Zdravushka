import asyncio
import io
import re
import wave
from functools import lru_cache
from pathlib import Path

import numpy as np

from app import ai, config

UNITS = ["ноль", "один", "два", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять", "десять",
         "одиннадцать", "двенадцать", "тринадцать", "четырнадцать", "пятнадцать", "шестнадцать",
         "семнадцать", "восемнадцать", "девятнадцать"]
TENS = ["", "", "двадцать", "тридцать", "сорок", "пятьдесят", "шестьдесят", "семьдесят",
        "восемьдесят", "девяносто"]
HUNDREDS = ["", "сто", "двести", "триста", "четыреста", "пятьсот", "шестьсот", "семьсот",
            "восемьсот", "девятьсот"]


def number_to_words(n: int) -> str:
    if n < 20:
        return UNITS[n]
    if n >= 1000:
        th, rest = divmod(n, 1000)
        word = {1: "тысяча", 2: "две тысячи", 3: "три тысячи", 4: "четыре тысячи"}.get(th, f"{UNITS[th]} тысяч")
        return word + (f" {number_to_words(rest)}" if rest else "")
    parts = []
    h, rest = divmod(n, 100)
    if h:
        parts.append(HUNDREDS[h])
    if rest >= 20:
        t, u = divmod(rest, 10)
        parts.append(TENS[t])
        if u:
            parts.append(UNITS[u])
    elif rest:
        parts.append(UNITS[rest])
    return " ".join(parts)


def normalize(text: str) -> str:
    text = re.sub(r"\d{1,4}", lambda m: number_to_words(int(m.group())), text)
    return text.replace("«", "").replace("»", "").replace("—", ",")


def split_sentences(text: str) -> list[str]:
    parts = re.split(r"(?<=[.!?;])\s+", text.strip())
    return [p for p in parts if p]


@lru_cache(maxsize=1)
def _piper_voice():
    from piper import PiperVoice
    return PiperVoice.load(config.PIPER_MODEL)


def _piper(text: str) -> bytes:
    voice = _piper_voice()
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wav:
        if hasattr(voice, "synthesize_wav"):
            voice.synthesize_wav(text, wav)
        else:
            voice.synthesize(text, wav)
    return buf.getvalue()


def piper_available() -> bool:
    return Path(config.PIPER_MODEL).exists()


async def speak(text: str) -> bytes:
    text = normalize(text)
    if config.TTS_BACKEND == "openai" and config.TTS_URL:
        try:
            return await ai.text_to_speech(text)
        except Exception:
            if not piper_available():
                raise
    return await asyncio.to_thread(_piper, text)


def to_pcm(wav_bytes: bytes, rate: int = 8000) -> bytes:
    with wave.open(io.BytesIO(wav_bytes)) as w:
        src_rate, channels, width = w.getframerate(), w.getnchannels(), w.getsampwidth()
        frames = w.readframes(w.getnframes())
    if width != 2:
        raise ValueError("Ожидается 16-битный WAV")
    data = np.frombuffer(frames, dtype=np.int16).astype(np.float32)
    if channels > 1:
        data = data.reshape(-1, channels).mean(axis=1)
    if src_rate != rate and len(data):
        n_out = int(len(data) * rate / src_rate)
        data = np.interp(np.linspace(0, len(data) - 1, n_out), np.arange(len(data)), data)
    return data.clip(-32768, 32767).astype(np.int16).tobytes()


def pcm_to_wav(pcm: bytes, rate: int = 8000) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(pcm)
    return buf.getvalue()
