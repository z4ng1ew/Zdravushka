# Подключение трёх нейросетей: распознавание речи (STT), синтез речи (TTS) и языковая модель (LLM).
# Все три вызываются по OpenAI-совместимому API — его поддерживают почти все серверы:
# vLLM, Ollama, LM Studio, faster-whisper-server/speaches, Cloud.ru и другие.
# Адреса, токены и названия моделей — в .env, код менять не нужно.
import asyncio
import json
import math
import re

import httpx

import time

from app import config, providers
from app.resilience import CircuitBreaker, backoff

# Шлюз хакатона: не больше 2 одновременных запросов на команду — третий получил бы 429.
_gateway = asyncio.Semaphore(config.AI_MAX_CONCURRENT)
# Предохранитель на каждый источник: после 3 сбоев подряд минуту его не ждём, а сразу берём следующий
_breakers: dict[str, CircuitBreaker] = {}
NO_VERBOSE_JSON: set[str] = set()   # серверы, не умеющие verbose_json — второй раз не спрашиваем


def breaker(kind: str, provider: str) -> CircuitBreaker:
    return _breakers.setdefault(f"{kind}:{provider}", CircuitBreaker(f"{kind}:{provider}", failures=3, cooldown=60))


llm_breaker = breaker("llm", "organizers")  # совместимость: прежнее имя
RETRY_STATUSES = (429, 500, 502, 503, 504)


LAST: dict[str, dict] = {}   # последний удачный вызов: кто ответил и за сколько мс (для журнала и /api/health)


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
    endpoints = providers.chain("llm")
    if not endpoints:
        raise AIError("LLM не настроена")
    errors = []
    for i, ep in enumerate(endpoints):  # выбранный источник, при сбое — следующий; повторов нет: пациент ждёт
        br = breaker("llm", ep.provider)
        if br.is_open:
            errors.append(f"{ep.provider}: отключён после серии сбоев")
            continue
        body = {"model": ep.model, "messages": messages, "temperature": temperature, "max_tokens": max_tokens}
        t0 = time.monotonic()
        try:
            resp = await _post(ep.url + "/chat/completions", config.LLM_TIMEOUT, retries=0,
                               json=body, headers=_headers(ep.token))
            if resp.status_code != 200:
                raise AIError(f"ответила {resp.status_code}: {resp.text[:200]}")
            content = resp.json()["choices"][0]["message"]["content"]
            if not isinstance(content, str) or not content.strip():
                raise AIError("пустой ответ")
        except (AIError, ValueError, KeyError, IndexError, TypeError) as e:
            br.failure()
            errors.append(f"{ep.provider}: {e}")
            continue
        br.success()
        LAST["llm"] = {"provider": ep.provider, "model": ep.model, "ms": int((time.monotonic() - t0) * 1000)}
        return content.strip()
    raise AIError("LLM: " + "; ".join(errors))


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
    """LLM, которая обязана вернуть JSON. Битый JSON — без второго вызова: сразу запасной разбор правилами
    (второй вызов удваивал задержку как раз тогда, когда шлюз и так медленный — техчекпоинт 23.10)."""
    return parse_json(await llm_chat(messages, max_tokens=200))


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
    endpoints = providers.chain("stt")
    if not endpoints:
        raise AIError("распознавание речи не настроено")
    errors, body = [], None
    for ep in endpoints:  # выбранный источник, при сбое — следующий
        br = breaker("stt", ep.provider)
        if br.is_open:
            errors.append(f"{ep.provider}: отключён после серии сбоев")
            continue
        data = {"model": ep.model, "language": "ru", "temperature": "0"}
        if ep.url not in NO_VERBOSE_JSON:
            data["response_format"] = "verbose_json"
        if config.STT_PROMPT:  # словарь предметной области: Whisper реже путает «офтальмолог», «отоларинголог», даты
            data["prompt"] = config.STT_PROMPT
        t0 = time.monotonic()
        try:
            resp = await _post(ep.url + "/audio/transcriptions", config.STT_TIMEOUT, retries=0,
                               files={"file": (filename, audio)}, data=data, headers=_headers(ep.token))
            if resp.status_code == 400 and "response_format" in data:  # не умеет verbose_json — запомним
                NO_VERBOSE_JSON.add(ep.url)
                data.pop("response_format")
                resp = await _post(ep.url + "/audio/transcriptions", config.STT_TIMEOUT, retries=0,
                                   files={"file": (filename, audio)}, data=data, headers=_headers(ep.token))
            if resp.status_code != 200:
                raise AIError(f"ответил {resp.status_code}: {resp.text[:200]}")
            body = resp.json()
            text = body.get("text", "") if isinstance(body, dict) else ""
        except (AIError, ValueError) as e:
            br.failure()
            errors.append(f"{ep.provider}: {e}")
            continue
        br.success()
        LAST["stt"] = {"provider": ep.provider, "model": ep.model, "ms": int((time.monotonic() - t0) * 1000)}
        break
    else:
        raise AIError("STT: " + "; ".join(errors))
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
