#!/bin/bash

# ============================================================
# Скрипт для сохранения структуры и кода проекта Zdravushka
# ============================================================

OUTPUT_FILE="project_contents.txt"

# ---------- СПИСОК ФАЙЛОВ ДЛЯ СОХРАНЕНИЯ ----------
INCLUDE_FILES=(
    "app/__init__.py"
    "app/config.py"
    "app/dialog.py"
    "app/main.py"
    "app/models.py"
    "app/schedule.py"
    "app/stand_client.py"
    "scripts/check_stand.py"
    "scripts/build_schedule.py"
    "data/schedule.json"
    "requirements.txt"
)
# --------------------------------------------------

is_secret_file() {
    local name
    name="$(basename "$1")"
    [[ "$name" == ".env" || "$name" == .env.* || "$name" == *.env || "$name" == *.env.* ]]
}

is_binary_file() {
    local name
    name="$(basename "$1")"
    # Защищаемся от случайного добавления таблиц, картинок и кэша
    [[ "$name" == *.xlsx || "$name" == *.xls || "$name" == *.png || "$name" == *.jpg || "$name" == *.pdf || "$name" == *.pyc ]]
}

# Очищаем выходной файл
> "$OUTPUT_FILE"

# ========== 1. Дерево проекта ==========
echo "===== ДЕРЕВО ПРОЕКТА =====" >> "$OUTPUT_FILE"

if command -v tree &> /dev/null; then
    tree -a -f \
        -I "__pycache__|.git|.venv|.env|.env.*|*.env|$OUTPUT_FILE" \
        --noreport \
        | grep -vE '(^|/)\.env($|/|\.)' \
        >> "$OUTPUT_FILE"
else
    echo "(tree не установлен, используется упрощённый вывод)" >> "$OUTPUT_FILE"
    find . \
        -not -path "./__pycache__/*" \
        -not -path "./.git/*" \
        -not -path "./.venv/*" \
        -not -name ".env" \
        -not -name ".env.*" \
        -not -name "*.env" \
        -not -name "$OUTPUT_FILE" \
        -print \
        | sed 's|^\./||' \
        | grep -vE '(^|/)\.env($|/|\.)' \
        | sort \
        | awk -F/ '{
            indent = "";
            for (i = 1; i < NF; i++) {
                indent = indent "    ";
            }
            print indent $NF;
        }' \
        >> "$OUTPUT_FILE"
fi

printf "\n\n" >> "$OUTPUT_FILE"

# ========== 2. Содержимое выбранных файлов ==========
echo "===== СОДЕРЖИМОЕ ФАЙЛОВ =====" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

for file in "${INCLUDE_FILES[@]}"; do
    if is_secret_file "$file"; then
        echo "Пропускаем секретный файл: $file" >&2
        continue
    fi

    if is_binary_file "$file"; then
        echo "Пропускаем бинарный файл: $file" >&2
        continue
    fi

    if [[ "$file" == "$OUTPUT_FILE" ]]; then
        continue
    fi

    if [[ -f "$file" ]]; then
        echo "Добавляем: $file" >&2
        echo "===== $file =====" >> "$OUTPUT_FILE"
        cat "$file" >> "$OUTPUT_FILE"
        printf "\n\n" >> "$OUTPUT_FILE"
    else
        echo "Предупреждение: файл '$file' не найден, пропускаем" >&2
    fi
done

echo "Готово! Результат сохранён в $OUTPUT_FILE" >&2