#!/usr/bin/env bash
# Закрепить точные версии зависимостей из рабочего окружения (.venv) в requirements.lock.
# Запускать на VM после успешной проверки (тесты зелёные, звонок проходит), затем закоммитить файл.
set -euo pipefail
cd "$(dirname "$0")/.."
. .venv/bin/activate
{
  echo "# Точные версии, на которых решение проверено: $(python -V), $(date +%d.%m.%Y)"
  echo "# Сгенерировано scripts/lock_requirements.sh — вручную не править"
  pip freeze --exclude-editable | grep -viE '^(pip|setuptools|wheel|pytest|pytest-asyncio|pyflakes|iniconfig|pluggy|packaging)==' | sort
} > requirements.lock
echo "requirements.lock: $(grep -vc '^#' requirements.lock) пакетов"
