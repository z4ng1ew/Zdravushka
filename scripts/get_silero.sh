#!/usr/bin/env bash
# Скачать модель Silero v4 (русский) один раз — дальше сервер работает без интернета.
# Использование: ./scripts/get_silero.sh   (затем в .env: TTS_BACKEND=silero)
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p data/voices
if [ -f data/voices/silero_v4_ru.pt ]; then echo "Модель уже скачана: data/voices/silero_v4_ru.pt"; exit 0; fi
curl -fL -o data/voices/silero_v4_ru.pt https://models.silero.ai/models/tts/ru/v4_ru.pt \
  && echo "Готово: data/voices/silero_v4_ru.pt" \
  || { rm -f data/voices/silero_v4_ru.pt; echo "Не скачалось напрямую — сервер попробует загрузить модель через torch.hub при старте."; }
