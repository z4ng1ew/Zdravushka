#!/usr/bin/env bash
# Запуск Здравушки на VM: слушаем 0.0.0.0:8000 (требование площадки), мост телефонии — на 9092.
cd "$(dirname "$0")"
[ -d .venv ] || python3 -m venv .venv
. .venv/bin/activate
pip install -q -r requirements.txt
# голос Piper (запасной), если ещё не скачан
if [ ! -f data/voices/ru_RU-irina-medium.onnx ]; then
  mkdir -p data/voices
  base=https://huggingface.co/rhasspy/piper-voices/resolve/main/ru/ru_RU/irina/medium
  wget -q -O data/voices/ru_RU-irina-medium.onnx "$base/ru_RU-irina-medium.onnx"
  wget -q -O data/voices/ru_RU-irina-medium.onnx.json "$base/ru_RU-irina-medium.onnx.json"
fi
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
