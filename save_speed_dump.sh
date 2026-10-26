#!/usr/bin/env bash
set -euo pipefail

OUTPUT_FILE="project_speed_dump.txt"

# Если нужно ещё сильнее ужать — поставь 1.
# Тогда удалятся пустые строки и строки, которые целиком являются комментариями.
STRIP_COMMENTS=0

FILES=(
    "app/config.py"
    "app/ai.py"
    "app/resilience.py"
    "app/stand_client.py"
    "app/tts.py"
)

# Если нужна ещё оптимизация запросов к МИС на уровне диалога,
# добавь отдельно:
#
# FILES+=("app/dialog/mis.py")
#
# Но обычно для анализа скорости запросов достаточно 5 файлов выше.

: > "$OUTPUT_FILE"

echo "===== ДАМП: СКОРОСТЬ ЗАПРОСОВ =====" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

add_file() {
    local file="$1"

    if [[ ! -f "$file" ]]; then
        echo "Пропуск: файл не найден: $file" >&2
        return
    fi

    echo "Добавляем: $file" >&2
    echo "===== $file =====" >> "$OUTPUT_FILE"

    if [[ "$STRIP_COMMENTS" == "1" ]]; then
        # Удаляем пустые строки и строки, состоящие только из комментария.
        # Инлайн-комментарии остаются.
        sed -E '/^[[:space:]]*#/d; /^[[:space:]]*$/d' "$file" >> "$OUTPUT_FILE"
    else
        cat "$file" >> "$OUTPUT_FILE"
    fi

    printf "\n\n" >> "$OUTPUT_FILE"
}

for file in "${FILES[@]}"; do
    add_file "$file"
done

bytes=$(wc -c < "$OUTPUT_FILE")
chars=$(wc -m < "$OUTPUT_FILE" 2>/dev/null || echo "$bytes")

echo "Готово: $OUTPUT_FILE" >&2
echo "Байт: $bytes" >&2
echo "Символов: $chars" >&2
echo "Примерный размер: $((chars / 3)) токенов (грубая оценка)" >&2