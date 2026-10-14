#!/bin/bash

# ============================================================
# Скрипт для сохранения:
#   1. Дерева проекта без __pycache__, .git, .venv, .env
#   2. Содержимого только указанных файлов
#
# Важно:
#   - .env не копируется вообще
#   - .env.* и *.env тоже исключаются
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
    "requirements.txt"
)
# --------------------------------------------------

is_secret_file() {
    local path="$1"
    local name
    name="$(basename "$path")"

    if [[ "$name" == ".env" ]]; then
        return 0
    fi

    if [[ "$name" == .env.* ]]; then
        return 0
    fi

    if [[ "$name" == *.env ]]; then
        return 0
    fi

    if [[ "$name" == *.env.* ]]; then
        return 0
    fi

    return 1
}

# Очищаем выходной файл
> "$OUTPUT_FILE"

# ========== 1. Дерево проекта ==========
echo "===== ДЕРЕВО ПРОЕКТА =====" >> "$OUTPUT_FILE"

if command -v tree &> /dev/null; then
    # Исключаем служебные папки и файлы.
    # .env дополнительно фильтруем через grep ниже.
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
        -not -path "./.env" \
        -not -path "./.env/*" \
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
    # Дополнительная защита: даже если .env случайно добавят
    # в INCLUDE_FILES, он всё равно не будет скопирован.
    if is_secret_file "$file"; then
        echo "Пропускаем секретный файл: $file" >&2
        continue
    fi

    # На всякий случай не копируем сам итоговый файл.
    if [[ "$file" == "$OUTPUT_FILE" ]]; then
        echo "Пропускаем итоговый файл: $file" >&2
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