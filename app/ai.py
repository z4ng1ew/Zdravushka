# Подключение трёх нейросетей: распознавание речи (STT), синтез речи (TTS) и языковая модель (LLM).
# Все три вызываются по OpenAI-совместимому API — его поддерживают почти все серверы:
# vLLM, Ollama, LM Studio, faster-whisper-server/speaches, Cloud.ru и другие.
# Адреса, токены и названия моделей — в .env, код менять не нужно.
import asyncio
import json
import math
import re

import httpx

from app import config
from app.resilience import CircuitBreaker, backoff

# Шлюз хакатона: не больше 2 одновременных запросов на команду — третий получил бы 429.
_gateway = asyncio.Semaphore(config.AI_MAX_CONCURRENT)
# Предохранитель LLM: после 3 сбоев подряд минуту не ждём её, а сразу идём в запасной разбор
llm_breaker = CircuitBreaker("LLM", failures=3, cooldown=60)
RETRY_STATUSES = (429, 500, 502, 503, 504)


class AIError(Exception):
    """Ошибка нейросети: сервер недоступен, неверный токен, плохой ответ."""


def _headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"} if token else {}


async def _post(url: str, timeout: float, retries: int = 1, **kw) -> httpx.Response:
    """POST в шлюз нейросетей с единым поведением при сбоях.
    Таймаут, обрыв, 429 и 5xx — один повтор с паузой; потом AIError (звонок не падает, работает запасной путь)."""
    last = ""
    for attempt in range(retries + 1):
        try:
            async with _gateway:
                async with httpx.AsyncClient(timeout=timeout) as http:
                    resp = await http.post(url, **kw)
        except httpx.HTTPError as e:
            last = f"нет ответа: {type(e).__name__}"
        else:
            if resp.status_code not in RETRY_STATUSES:
                return resp
            last = f"код {resp.status_code}"
        if attempt < retries:
            await backoff(attempt)
    raise AIError(f"{url}: {last}")


async def llm_chat(messages: list[dict], temperature: float = 0.2, max_tokens: int = 400) -> str:
    """Отправляет диалог в LLM и возвращает текст ответа.

    messages — список вида [{"role": "system", "content": "..."}, {"role": "user", "content": "..."}].
    temperature низкая: нам нужны точные и одинаковые ответы, а не творчество.
    """
    url = config.LLM_URL.rstrip("/") + "/chat/completions"
    body = {"model": config.LLM_MODEL, "messages": messages,
            "temperature": temperature, "max_tokens": max_tokens}
    if not config.LLM_URL:
        raise AIError("LLM не настроена")
    if llm_breaker.is_open:
        raise AIError("LLM временно отключена после серии сбоев")
    try:
        resp = await _post(url, config.LLM_TIMEOUT, json=body, headers=_headers(config.LLM_TOKEN))
    except AIError:
        llm_breaker.failure()
        raise
    if resp.status_code != 200:
        raise AIError(f"LLM ответила {resp.status_code}: {resp.text[:300]}")
    try:  # проверяем формат ответа, а не верим ему: любое отклонение → AIError → запасной разбор
        content = resp.json()["choices"][0]["message"]["content"]
    except (ValueError, KeyError, IndexError, TypeError) as e:
        raise AIError(f"LLM вернула ответ неожиданного формата: {resp.text[:200]}") from e
    if not isinstance(content, str) or not content.strip():
        raise AIError("LLM вернула пустой ответ")
    llm_breaker.success()
    return content.strip()


def parse_json(text: str) -> dict:
    """Достаёт JSON из ответа модели, даже если она обернула его в ```json ... ``` или добавила слова."""
    match = re.search(r"\{.*\}", text, re.S)
    if not match:
        raise AIError(f"В ответе модели нет JSON: {text[:200]}")
    try:
        data = json.loads(match.group())
    except json.JSONDecodeError as e:
        raise AIError(f"Модель вернула битый JSON: {e}") from e
    if not isinstance(data, dict):
        raise AIError("Модель вернула не объект JSON")
    return data


async def llm_json(messages: list[dict]) -> dict:
    """LLM, которая обязана вернуть JSON. Одна повторная попытка, если ответ не разобрался."""
    text = await llm_chat(messages)
    try:
        return parse_json(text)
    except AIError:
        retry = messages + [{"role": "assistant", "content": text},
                            {"role": "user", "content": "Ответь только JSON-объектом, без пояснений."}]
        return parse_json(await llm_chat(retry))


# Whisper «слышит» в тишине и шуме фразы из субтитров к видео. Это не слова пациента — выбрасываем
WHISPER_HALLUCINATIONS = ("продолжение следует", "субтитр", "спасибо за просмотр", "подписывайтесь",
                          "редактор", "корректор", "dimatorzok", "благодарю за внимание")


def is_hallucination(text: str) -> bool:
    low = text.lower().strip(" .!…")
    return not low or any(h in low for h in WHISPER_HALLUCINATIONS)


def asr_confidence(segments) -> float | None:
    """Уверенность распознавания 0..1 из ответа Whisper (verbose_json): средняя вероятность
    слов по сегментам (exp(avg_logprob)) с поправкой на вероятность «это не речь». Нет данных — None."""
    if not isinstance(segments, list) or not segments:
        return None
    scores = []
    for seg in segments:
        if not isinstance(seg, dict) or not isinstance(seg.get("avg_logprob"), (int, float)):
            continue
        speech = 1.0 - float(seg.get("no_speech_prob") or 0.0)
        scores.append(max(0.0, min(1.0, math.exp(seg["avg_logprob"]) * speech)))
    return round(sum(scores) / len(scores), 2) if scores else None


def _echo_of_prompt(text: str) -> bool:
    """На тишине Whisper иногда «повторяет» подсказку — такой текст пациент не говорил."""
    low = text.lower().strip(" .,!?")
    return bool(config.STT_PROMPT) and len(low) > 15 and low in config.STT_PROMPT.lower()


async def transcribe(audio: bytes, filename: str = "audio.wav") -> tuple[str, float | None]:
    """Распознавание речи: аудио → (текст, уверенность 0..1 или None, если сервер её не даёт)."""
    if not config.STT_URL:
        raise AIError("распознавание речи не настроено")
    url = config.STT_URL.rstrip("/") + "/audio/transcriptions"
    data = {"model": config.STT_MODEL, "language": "ru", "response_format": "verbose_json", "temperature": "0"}
    if config.STT_PROMPT:  # словарь предметной области: Whisper реже путает «офтальмолог», «отоларинголог», даты
        data["prompt"] = config.STT_PROMPT
    resp = await _post(url, config.STT_TIMEOUT, files={"file": (filename, audio)}, data=data,
                       headers=_headers(config.STT_TOKEN))
    if resp.status_code == 400:  # сервер не умеет verbose_json — обычный ответ, без уверенности
        data.pop("response_format")
        resp = await _post(url, config.STT_TIMEOUT, files={"file": (filename, audio)}, data=data,
                           headers=_headers(config.STT_TOKEN))
    if resp.status_code != 200:
        raise AIError(f"STT ответил {resp.status_code}: {resp.text[:300]}")
    try:
        body = resp.json()
        text = body.get("text", "")
    except (ValueError, AttributeError) as e:
        raise AIError("STT вернул ответ неожиданного формата") from e
    text = text.strip() if isinstance(text, str) else ""
    if is_hallucination(text) or _echo_of_prompt(text):
        return "", None
    return text, asr_confidence(body.get("segments"))


async def speech_to_text(audio: bytes, filename: str = "audio.wav") -> str:
    """Только текст распознавания (для мест, где уверенность не нужна)."""
    return (await transcribe(audio, filename))[0]


async def text_to_speech(text: str) -> bytes:
    """Синтез речи: текст → аудио (wav). Возвращает байты файла."""
    url = config.TTS_URL.rstrip("/") + "/audio/speech"
    body = {"model": config.TTS_MODEL, "input": text, "voice": config.TTS_VOICE,
            "response_format": "wav"}
    if not config.TTS_URL:
        raise AIError("внешний синтез речи не настроен")
    resp = await _post(url, config.TTS_TIMEOUT, json=body, headers=_headers(config.TTS_TOKEN))
    if resp.status_code != 200:
        raise AIError(f"TTS ответил {resp.status_code}: {resp.text[:300]}")
    return resp.content
