#!/bin/bash

# ============================================================
# Скрипт для сохранения:
#   1. Дерева проекта (полные пути, но без содержимого
#      папок vosk-model-ru-0.42, vosk-model-small-ru-0.22,
#      папки "я", а также без __pycache__, .git, .venv, vosk-model целиком)
#   2. Содержимого только указанных файлов
# в один текстовый файл.
# ============================================================

OUTPUT_FILE="project_contents.txt"

# ---------- СПИСОК ФАЙЛОВ ДЛЯ СОХРАНЕНИЯ ----------
INCLUDE_FILES=(
    "core/__init__.py"
    "core/brain.py"
    "core/config.py"
    "core/rag.py"
    "core/vision.py"
    "audio/__init__.py"
    "audio/ears.py"
    "ui/__init__.py"
    "ui/dialogs.py"
    "ui/overlay.py"
    "ui/widgets.py"
    "main.py"
    "requirements.txt"
    "theme.py"
    "Makefile"
    "run.sh"
)
# --------------------------------------------------

# Очищаем выходной файл
> "$OUTPUT_FILE"

# ========== 1. Дерево проекта ==========
echo "===== ДЕРЕВО ПРОЕКТА =====" >> "$OUTPUT_FILE"

if command -v tree &> /dev/null; then
    # -f — полные пути, -a — показывать скрытые файлы,
    # -I — исключить полностью ненужные папки (добавил |я),
    # --noreport — не выводить статистику в конце.
    tree -a -f -I "__pycache__|.git|.venv|vosk-model|я" --noreport \
        | grep -v -E "vosk-model-ru-0.42/|vosk-model-small-ru-0.22/|я/" \
        >> "$OUTPUT_FILE"
else
    echo "(tree не установлен, используется упрощённый вывод)" >> "$OUTPUT_FILE"
    # fallback: find с исключением и фильтрацией
    find . \
        -not -path "./vosk-model/*" \
        -not -path "./__pycache__/*" \
        -not -path "./.venv/*" \
        -not -path "./.git/*" \
        -not -path "./я/*" \
        -not -path "./я" \
        -print \
        | grep -v -E "\./vosk-model-ru-0.42/|\./vosk-model-small-ru-0.22/|\./я/" \
        | sed -e 's;[^/]*/;|__;g;s;__|;  ;g' \
        >> "$OUTPUT_FILE"
fi

echo -e "\n" >> "$OUTPUT_FILE"

# ========== 2. Содержимое выбранных файлов ==========
echo "===== СОДЕРЖИМОЕ ФАЙЛОВ =====" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

for file in "${INCLUDE_FILES[@]}"; do
    if [[ -f "$file" ]]; then
        echo "Добавляем: $file" >&2
        echo "===== $file =====" >> "$OUTPUT_FILE"
        cat "$file" >> "$OUTPUT_FILE"
        echo -e "\n" >> "$OUTPUT_FILE"
    else
        echo "Предупреждение: файл '$file' не найден, пропускаем" >&2
    fi
done

echo "Готово! Результат сохранён в $OUTPUT_FILE" >&2