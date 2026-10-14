import io
import re
import wave
from functools import lru_cache

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


async def speak(text: str) -> bytes:
    text = normalize(text)
    if config.TTS_BACKEND == "piper":
        import asyncio
        return await asyncio.to_thread(_piper, text)
    return await ai.text_to_speech(text)
