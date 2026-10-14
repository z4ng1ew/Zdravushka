import asyncio
import sys
import time
from pathlib import Path

from app import ai, config

PHRASE = "Здравствуйте! Я Здравушка, виртуальный помощник регистратуры."


async def check_llm():
    t = time.monotonic()
    data = await ai.llm_json([
        {"role": "system", "content": "Ты извлекаешь данные из фразы пациента. Отвечай только JSON."},
        {"role": "user", "content": 'Фраза: "Хочу записаться к терапевту на завтра утром". '
                                    'Верни JSON: {"intent": "...", "specialty": "...", "part_of_day": "..."}'},
    ])
    print(f"  ответ: {data}  ({time.monotonic() - t:.1f} с)")


async def check_tts() -> bytes:
    t = time.monotonic()
    audio = await ai.text_to_speech(PHRASE)
    out = Path("data/tmp/check_tts.wav")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(audio)
    print(f"  {len(audio) // 1024} КБ → {out}  ({time.monotonic() - t:.1f} с)")
    return audio


async def check_stt(audio: bytes):
    t = time.monotonic()
    text = await ai.speech_to_text(audio, "check_tts.wav")
    print(f"  распознано: «{text}»  ({time.monotonic() - t:.1f} с)")


async def run(name: str, enabled: bool, func, *args):
    print(f"\n[{name}]")
    if not enabled:
        print("  пропуск: не заданы адрес/модель в .env")
        return None
    try:
        return await func(*args)
    except Exception as e:
        print(f"  ОШИБКА: {e}")
        return None


async def main():
    await run("LLM", bool(config.LLM_URL and config.LLM_MODEL), check_llm)
    audio = await run("TTS", bool(config.TTS_URL), check_tts)
    if len(sys.argv) > 1:
        audio = Path(sys.argv[1]).read_bytes()
    if audio:
        await run("STT", bool(config.STT_URL), check_stt, audio)
    else:
        print("\n[STT]\n  пропуск: нет аудио от TTS (можно проверить отдельно своим файлом)")


if __name__ == "__main__":
    asyncio.run(main())
