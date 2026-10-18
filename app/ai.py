import json
import re

import httpx

from app import config


class AIError(Exception):
    """Ошибка нейросети: сервер недоступен, неверный токен, плохой ответ."""


def _headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"} if token else {}


async def _post(url: str, timeout: float, **kw) -> httpx.Response:
    try:
        async with httpx.AsyncClient(timeout=timeout) as http:
            return await http.post(url, **kw)
    except httpx.HTTPError as e:
        raise AIError(f"нет ответа от {url}: {type(e).__name__}") from e


async def llm_chat(messages: list[dict], temperature: float = 0.2, max_tokens: int = 400) -> str:
    url = config.LLM_URL.rstrip("/") + "/chat/completions"
    body = {"model": config.LLM_MODEL, "messages": messages,
            "temperature": temperature, "max_tokens": max_tokens}
    if not config.LLM_URL:
        raise AIError("LLM не настроена")
    resp = await _post(url, config.LLM_TIMEOUT, json=body, headers=_headers(config.LLM_TOKEN))
    if resp.status_code != 200:
        raise AIError(f"LLM ответила {resp.status_code}: {resp.text[:300]}")
    try:
        content = resp.json()["choices"][0]["message"]["content"]
    except (ValueError, KeyError, IndexError, TypeError) as e:
        raise AIError(f"LLM вернула ответ неожиданного формата: {resp.text[:200]}") from e
    if not isinstance(content, str) or not content.strip():
        raise AIError("LLM вернула пустой ответ")
    return content.strip()


def parse_json(text: str) -> dict:
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
    text = await llm_chat(messages)
    try:
        return parse_json(text)
    except AIError:
        retry = messages + [{"role": "assistant", "content": text},
                            {"role": "user", "content": "Ответь только JSON-объектом, без пояснений."}]
        return parse_json(await llm_chat(retry))


WHISPER_HALLUCINATIONS = ("продолжение следует", "субтитр", "спасибо за просмотр", "подписывайтесь",
                          "редактор", "корректор", "dimatorzok", "благодарю за внимание")


def is_hallucination(text: str) -> bool:
    low = text.lower().strip(" .!…")
    return not low or any(h in low for h in WHISPER_HALLUCINATIONS)


async def speech_to_text(audio: bytes, filename: str = "audio.wav") -> str:
    url = config.STT_URL.rstrip("/") + "/audio/transcriptions"
    files = {"file": (filename, audio)}
    data = {"model": config.STT_MODEL, "language": "ru"}
    if not config.STT_URL:
        raise AIError("распознавание речи не настроено")
    resp = await _post(url, config.STT_TIMEOUT, files=files, data=data, headers=_headers(config.STT_TOKEN))
    if resp.status_code != 200:
        raise AIError(f"STT ответил {resp.status_code}: {resp.text[:300]}")
    try:
        text = resp.json().get("text", "")
    except (ValueError, AttributeError) as e:
        raise AIError("STT вернул ответ неожиданного формата") from e
    text = text.strip() if isinstance(text, str) else ""
    return "" if is_hallucination(text) else text


async def text_to_speech(text: str) -> bytes:
    url = config.TTS_URL.rstrip("/") + "/audio/speech"
    body = {"model": config.TTS_MODEL, "input": text, "voice": config.TTS_VOICE,
            "response_format": "wav"}
    if not config.TTS_URL:
        raise AIError("внешний синтез речи не настроен")
    resp = await _post(url, config.TTS_TIMEOUT, json=body, headers=_headers(config.TTS_TOKEN))
    if resp.status_code != 200:
        raise AIError(f"TTS ответил {resp.status_code}: {resp.text[:300]}")
    return resp.content
