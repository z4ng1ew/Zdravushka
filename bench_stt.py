# Сравнение моделей распознавания речи на VM: скорость и точность на фразах из сценариев.
#
# Запуск из корня проекта (в .venv):
#   python -m scripts.bench_stt                                  # все источники из providers.json + шлюз
#   python -m scripts.bench_stt --model mac=openai/gigaam --model mac=whisper-1 --model organizers=openai/whisper-large-v3
#   python -m scripts.bench_stt --audio записи/                  # свои .wav (имя файла = правильный текст)
#   python -m scripts.bench_stt --runs 3 --rate 8000             # 3 прогона, звук как в телефоне (8 кГц)
#
# Фразы озвучиваются тем же голосом, что у ассистента (Silero/Piper), и понижаются до 8 кГц — как в трубке.
# Точность — доля правильно распознанных слов (без учёта регистра и знаков препинания).
# Звонков и запросов к МИС скрипт не делает; речь никуда, кроме выбранных источников, не уходит.
import argparse
import asyncio
import re
import statistics
import time
from pathlib import Path

import httpx

from app import providers, tts

PHRASES = [
    "Мне бы записаться к терапевту.",
    "Смирнова Ольга Викторовна, двенадцатое марта семьдесят восьмого.",
    "Иванов Пётр Сергеевич, первое апреля двухтысячного года.",
    "А после обеда есть что-нибудь?",
    "Давайте в пятницу.",
    "Третий вариант.",
    "Да, верно.",
    "Перенесите мою запись к офтальмологу.",
    "Мне нужно вызвать врача на дом.",
    "Улица Лесная, дом двенадцать, квартира сорок.",
    "Нет, больше ничего не нужно.",
]


def words(text: str) -> list[str]:
    return re.findall(r"[а-яё0-9]+", text.lower().replace("ё", "е"))


def accuracy(expected: str, got: str) -> float:
    exp, have = words(expected), words(got)
    if not exp:
        return 0.0
    pool = list(have)
    hit = 0
    for w in exp:
        match = next((h for h in pool if h == w or (len(w) > 4 and h[:len(w) - 2] == w[:-2])), None)
        if match is not None:
            hit += 1
            pool.remove(match)
    return hit / len(exp)


async def make_samples(rate: int) -> list[tuple[str, bytes]]:
    out = []
    for p in PHRASES:
        wav = await tts.speak(p)
        out.append((p, tts.pcm_to_wav(tts.to_pcm(wav, rate), rate)))
    return out


def load_dir(folder: Path) -> list[tuple[str, bytes]]:
    return [(f.stem.replace("_", " "), f.read_bytes()) for f in sorted(folder.glob("*.wav"))]


def targets(args) -> list[tuple[str, providers.Endpoint]]:
    provs = providers.all_providers()
    found = []
    if args.model:
        for spec in args.model:
            name, _, model = spec.partition("=")
            ep = providers._endpoint(name, {**provs.get(name, {}), "stt_model": model}, "stt") if name in provs else None
            if ep is None:
                print(f"  ! источник {name!r} не найден или без адреса — пропущен")
                continue
            found.append((f"{name}: {model}", ep))
    else:
        for name, p in provs.items():
            if (ep := providers._endpoint(name, p, "stt")):
                found.append((f"{name}: {ep.model}", ep))
    return found


async def transcribe(ep: providers.Endpoint, audio: bytes) -> tuple[str, float]:
    t0 = time.monotonic()
    async with httpx.AsyncClient(timeout=30) as http:
        resp = await http.post(ep.url + "/audio/transcriptions",
                               headers={"Authorization": f"Bearer {ep.token}"} if ep.token else {},
                               files={"file": ("a.wav", audio)}, data={"model": ep.model, "language": "ru"})
    ms = (time.monotonic() - t0) * 1000
    if resp.status_code != 200:
        raise RuntimeError(f"{resp.status_code}: {resp.text[:150]}")
    return resp.json().get("text", ""), ms


async def main():
    ap = argparse.ArgumentParser(description="Скорость и точность распознавания речи")
    ap.add_argument("--model", action="append", help="источник=модель, например mac=openai/gigaam (можно несколько)")
    ap.add_argument("--audio", type=Path, help="папка со своими .wav (имя файла = правильный текст)")
    ap.add_argument("--runs", type=int, default=2, help="сколько раз прогнать каждую фразу")
    ap.add_argument("--rate", type=int, default=8000, help="частота звука: 8000 — телефон, 16000 — сайт")
    ap.add_argument("--show", action="store_true", help="печатать распознанный текст")
    args = ap.parse_args()

    samples = load_dir(args.audio) if args.audio else await make_samples(args.rate)
    print(f"Фраз: {len(samples)}, прогонов: {args.runs}, звук: {'свои записи' if args.audio else f'{args.rate} Гц'}\n")
    rows = []
    for title, ep in targets(args):
        times, accs, errors = [], [], 0
        for _ in range(args.runs):
            for expected, audio in samples:
                try:
                    text, ms = await transcribe(ep, audio)
                except Exception as e:  # noqa: BLE001
                    errors += 1
                    print(f"  ! {title}: {e}")
                    continue
                times.append(ms)
                accs.append(accuracy(expected, text))
                if args.show:
                    print(f"  {title} | {ms:5.0f} мс | {text}")
        if times:
            p90 = sorted(times)[int(len(times) * 0.9) - 1] if len(times) > 1 else times[0]
            rows.append((title, statistics.median(times), p90, statistics.mean(accs) * 100, errors))
        else:
            rows.append((title, float("nan"), float("nan"), 0.0, errors))

    print(f"\n{'Источник: модель':45} {'медиана':>9} {'p90':>8} {'точность':>9} {'ошибок':>7}")
    for title, med, p90, acc, err in sorted(rows, key=lambda r: (-r[3], r[1])):
        print(f"{title:45} {med:7.0f} мс {p90:6.0f} мс {acc:7.0f} % {err:7}")


if __name__ == "__main__":
    asyncio.run(main())
