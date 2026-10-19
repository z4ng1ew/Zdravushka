#!/usr/bin/env bash
# Запуск Здравушки на VM: слушаем 0.0.0.0:8000 (требование площадки), мост телефонии — на 9092.
cd "$(dirname "$0")"
[ -d .venv ] || python3 -m venv .venv
. .venv/bin/activate
# точные проверенные версии (requirements.lock), если файл есть; иначе — диапазоны из requirements.txt
if [ -f requirements.lock ]; then pip install -q -r requirements.lock; else pip install -q -r requirements.txt; fi
# голос Piper (запасной), если ещё не скачан
if [ ! -f data/voices/ru_RU-irina-medium.onnx ]; then
  mkdir -p data/voices
  base=https://huggingface.co/rhasspy/piper-voices/resolve/main/ru/ru_RU/irina/medium
  wget -q -O data/voices/ru_RU-irina-medium.onnx "$base/ru_RU-irina-medium.onnx"
  wget -q -O data/voices/ru_RU-irina-medium.onnx.json "$base/ru_RU-irina-medium.onnx.json"
fi
# фронтенд: в git лежат только исходники (frontend/); если сборки ещё нет — собираем
if [ ! -f static/index.html ] && [ -d frontend ]; then
  mkdir -p static
  ./scripts/build_frontend.sh || echo "Фронтенд не собран — работает API и телефония, сайт будет пустым"
fi
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
