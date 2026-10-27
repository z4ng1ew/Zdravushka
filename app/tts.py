# Синтез речи для Здравушки.
# Варианты (TTS_BACKEND в .env):
#   piper  — локально на нашем сервере (Piper, без интернета, быстро на процессоре);
#   silero — локально на нашем сервере (Silero TTS, российская модель, голос естественнее Piper).
#            Модель загружается один раз в фоне при старте; пока не загрузилась или упала — говорим Piper.
#            Речь пациента и ответы никуда не уходят (152-ФЗ). Зависимости: requirements-silero.txt.
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


@lru_cache(maxsize=1)
def _silero_model():
    import torch  # импорт здесь: torch нужен только для варианта silero
    torch.set_num_threads(config.SILERO_THREADS)
    path = Path(config.SILERO_MODEL_PATH)
    if path.exists():  # файл модели скачан заранее (scripts/get_silero.sh) — без интернета
        return torch.package.PackageImporter(str(path)).load_pickle("tts_models", "model")
    model, _ = torch.hub.load("snakers4/silero-models", "silero_tts", language="ru",
                              speaker=config.SILERO_MODEL, trust_repo=True)
    return model


def _silero(text: str) -> bytes:
    """Голос персонажа: высота (SILERO_PITCH через SSML) и «детскость» (SILERO_SHIFT > 1 — выше и звонче)."""
    model, text = _silero_model(), text[:900]
    if config.SILERO_PITCH != "medium" or config.SILERO_SHIFT != 1.0:
        safe = text.replace("&", " и ").replace("<", " ").replace(">", " ")
        rate = "slow" if config.SILERO_SHIFT > 1.0 else "medium"  # сдвиг ускоряет речь — заранее замедляем
        audio = model.apply_tts(ssml_text=f'<speak><prosody pitch="{config.SILERO_PITCH}" rate="{rate}">{safe}</prosody></speak>',
                                speaker=config.SILERO_VOICE, sample_rate=config.SILERO_RATE).numpy()
    else:
        audio = model.apply_tts(text=text, speaker=config.SILERO_VOICE, sample_rate=config.SILERO_RATE,
                                put_accent=True, put_yo=True).numpy()
    if config.SILERO_SHIFT != 1.0 and len(audio):
        n = int(len(audio) / config.SILERO_SHIFT)
        audio = np.interp(np.linspace(0, len(audio) - 1, n), np.arange(len(audio)), audio)
    pcm = (audio * 32767).clip(-32768, 32767).astype(np.int16)
    return pcm_to_wav(pcm.tobytes(), config.SILERO_RATE)


async def warm_up():
    """Загрузить Silero в фоне при старте сервера и заранее озвучить частые фразы (приветствие, вопросы
    сценариев), чтобы они звучали без задержки на синтез."""
    from app import ui_texts
    if config.TTS_BACKEND == "silero":
        try:
            await asyncio.to_thread(_silero, "Здравствуйте.")
            for phrase in split_sentences(ui_texts.GREETING) + WARM_PHRASES:
                await speak(phrase)
        except Exception as e:  # noqa: BLE001 — нет torch или модели: работаем на Piper
            import logging
            logging.getLogger("tts").warning("Silero не загрузился, говорим голосом Piper: %s", e)


WARM_PHRASES = ["Хорошо.", "Назовите, пожалуйста, фамилию, имя, отчество и дату рождения.",
                 "Одну секунду, проверяю расписание.", "SMS с деталями придёт на этот номер.",
                 "Какой вариант удобен?", "Верно?", "Могу ещё чем-то помочь?", "Всего доброго, будьте здоровы!",
                 "Вы меня слышите?", "Назовите дату рождения пациента."]


def piper_available() -> bool:
    return Path(config.PIPER_MODEL).exists()


_CACHE: dict[str, bytes] = {}   # частые фразы («Назовите, пожалуйста…», «Верно?») синтезируем один раз
CACHE_MAX = 300


async def speak(text: str) -> bytes:
    """Текст → WAV. Частые фразы — из кэша (мгновенно), остальные — синтез."""
    key = f"{config.TTS_BACKEND}|{config.SILERO_VOICE}|{text}"
    if key in _CACHE:
        return _CACHE[key]
    wav = await _speak(text)
    if len(text) <= 200:
        if len(_CACHE) >= CACHE_MAX:
            _CACHE.pop(next(iter(_CACHE)))
        _CACHE[key] = wav
    return wav


async def _speak(text: str) -> bytes:
    """Текст → WAV. Удалённый голос с запасным локальным."""
    text = normalize(text)
    if config.TTS_BACKEND == "silero":
        try:
            return await asyncio.to_thread(_silero, text)
        except Exception:  # torch/модель недоступны — не молчим, говорим голосом Piper
            if not piper_available():
                raise
    elif config.TTS_BACKEND == "openai" and config.TTS_URL:
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
