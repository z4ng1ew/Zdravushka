# Синтез речи для Здравушки.
# Варианты (TTS_BACKEND в .env):
#   piper  — локально на нашем сервере (Piper, без интернета, быстро на процессоре);
#   openai — удалённый сервер с OpenAI-совместимым API: наш Silero на Mac (scripts/silero_server.py)
#            или любой другой. Если удалённый сервер не ответил — автоматически говорим голосом Piper.
# Перед синтезом цифры превращаются в слова: синтезаторы плохо читают «кабинет 126».
# Для телефона ответ режется на предложения: первое звучит, пока готовится второе.
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
    """0–9999 словами: 126 → «сто двадцать шесть»."""
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
    """Готовим текст к озвучке: числа → слова, лишние символы убираем."""
    text = re.sub(r"\d{1,4}", lambda m: number_to_words(int(m.group())), text)
    return text.replace("«", "").replace("»", "").replace("—", ",")


def split_sentences(text: str) -> list[str]:
    """Режем ответ на предложения (и длинные перечисления по «;»), чтобы начать говорить раньше."""
    parts = re.split(r"(?<=[.!?;])\s+", text.strip())
    return [p for p in parts if p]


@lru_cache(maxsize=1)
def _piper_voice():
    from piper import PiperVoice  # импорт здесь: библиотека нужна только для варианта piper
    return PiperVoice.load(config.PIPER_MODEL)


def _piper(text: str) -> bytes:
    voice = _piper_voice()
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wav:
        if hasattr(voice, "synthesize_wav"):   # piper-tts 1.3 и новее
            voice.synthesize_wav(text, wav)
        else:                                  # старые версии piper-tts
            voice.synthesize(text, wav)
    return buf.getvalue()


def piper_available() -> bool:
    return Path(config.PIPER_MODEL).exists()


async def speak(text: str) -> bytes:
    """Текст → WAV. Удалённый голос с запасным локальным."""
    text = normalize(text)
    if config.TTS_BACKEND == "openai" and config.TTS_URL:
        try:
            return await ai.text_to_speech(text)
        except Exception:  # удалённый сервер недоступен — не молчим, говорим голосом Piper
            if not piper_available():
                raise
    return await asyncio.to_thread(_piper, text)  # в отдельном потоке, сервер не «замирает»


def to_pcm(wav_bytes: bytes, rate: int = 8000) -> bytes:
    """WAV любого формата → сырой звук 16 бит, моно, нужной частоты (для телефона — 8000 Гц)."""
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
    """Сырой звук 16 бит моно → WAV (для отправки в распознавание)."""
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(pcm)
    return buf.getvalue()
