import json
import re

import httpx

from app import config


class AIError(Exception):
    pass


def _headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"} if token else {}


async def llm_chat(messages: list[dict], temperature: float = 0.2, max_tokens: int = 400) -> str:
    url = config.LLM_URL.rstrip("/") + "/chat/completions"
    body = {"model": config.LLM_MODEL, "messages": messages,
            "temperature": temperature, "max_tokens": max_tokens}
    async with httpx.AsyncClient(timeout=config.LLM_TIMEOUT) as http:
        resp = await http.post(url, json=body, headers=_headers(config.LLM_TOKEN))
    if resp.status_code != 200:
        raise AIError(f"LLM ответила {resp.status_code}: {resp.text[:300]}")
    return resp.json()["choices"][0]["message"]["content"].strip()


def parse_json(text: str) -> dict:
    match = re.search(r"\{.*\}", text, re.S)
    if not match:
        raise AIError(f"В ответе модели нет JSON: {text[:200]}")
    try:
        return json.loads(match.group())
    except json.JSONDecodeError as e:
        raise AIError(f"Модель вернула битый JSON: {e}") from e


async def llm_json(messages: list[dict]) -> dict:
    text = await llm_chat(messages)
    try:
        return parse_json(text)
    except AIError:
        retry = messages + [{"role": "assistant", "content": text},
                            {"role": "user", "content": "Ответь только JSON-объектом, без пояснений."}]
        return parse_json(await llm_chat(retry))


async def speech_to_text(audio: bytes, filename: str = "audio.wav") -> str:
    url = config.STT_URL.rstrip("/") + "/audio/transcriptions"
    files = {"file": (filename, audio)}
    data = {"model": config.STT_MODEL, "language": "ru"}
    async with httpx.AsyncClient(timeout=config.STT_TIMEOUT) as http:
        resp = await http.post(url, files=files, data=data, headers=_headers(config.STT_TOKEN))
    if resp.status_code != 200:
        raise AIError(f"STT ответил {resp.status_code}: {resp.text[:300]}")
    return resp.json().get("text", "").strip()


async def text_to_speech(text: str) -> bytes:
    url = config.TTS_URL.rstrip("/") + "/audio/speech"
    body = {"model": config.TTS_MODEL, "input": text, "voice": config.TTS_VOICE,
            "response_format": "wav"}
    async with httpx.AsyncClient(timeout=config.TTS_TIMEOUT) as http:
        resp = await http.post(url, json=body, headers=_headers(config.TTS_TOKEN))
    if resp.status_code != 200:
        raise AIError(f"TTS ответил {resp.status_code}: {resp.text[:300]}")
    return resp.content
