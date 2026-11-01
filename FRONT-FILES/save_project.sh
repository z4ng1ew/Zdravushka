#!/bin/bash

# ============================================================
# Скрипт для сохранения структуры и кода проекта Zdravushka_Front
# Актуализирован под новую структуру:
#   app/staff/{patients,schedule,settings,stats}, app/tickets,
#   новые компоненты (Shell, Kpi, DaySchedule, PilotNow, …),
#   новые lib/{dates,doctors,patients,store}.ts, scripts/sync-doctors.mjs
# Папки обходятся целиком — новые файлы подхватываются без правки списков.
# ============================================================

OUTPUT_FILE="project_contents.txt"

# ---------- СПИСОК ПАПОК И ФАЙЛОВ ДЛЯ СОХРАНЕНИЯ ----------
# public/ НЕ включаем: там только картинки (бинарники).
# В дерево проекта они попадут, а сохранять их содержимое нечего.
INCLUDE_DIRS=(
    "app"
    "components"
    "lib"
    "scripts"
)

# Точечные файлы в корне проекта
INCLUDE_ROOT_FILES=(
    "package.json"
    "tsconfig.json"
    "next.config.mjs"
    "README.md"
    ".gitignore"
)
# -----------------------------------------------------------

# Защита от случайных гигантов (например, если doctors.data.json разрастётся).
# Всё, что больше этого размера, пропускается с предупреждением.
MAX_FILE_BYTES=300000   # ~300 КБ

# Проверка на секретные файлы
is_secret_file() {
    local name
    name="$(basename "$1")"
    [[ "$name" == ".env" || "$name" == .env.* || "$name" == *.env || "$name" == *.env.* ]]
}

# Проверка на бинарные файлы (картинки, шрифты, архивы)
is_binary_file() {
    local name
    name="$(basename "$1")"
    [[ "$name" == *.png || "$name" == *.jpg || "$name" == *.jpeg || "$name" == *.gif || "$name" == *.svg || "$name" == *.ico || "$name" == *.woff || "$name" == *.woff2 || "$name" == *.ttf || "$name" == *.pdf ]]
}

# Проверка на мусорные/служебные файлы
is_junk_file() {
    local name
    name="$(basename "$1")"
    [[ "$name" == "package-lock.json" || "$name" == "next-env.d.ts" || "$name" == *.tsbuildinfo || "$name" == ".DS_Store" || "$name" == *.log || "$name" == "$OUTPUT_FILE" ]]
    # Если не хочешь тащить сгенерированный справочник врачей
    # (его создаёт scripts/sync-doctors.mjs), добавь сюда:
    # || "$name" == "doctors.data.json"
}

# Счётчики для итогового отчёта
ADDED=0; SKIP_SECRET=0; SKIP_BINARY=0; SKIP_JUNK=0; SKIP_BIG=0

# Очищаем выходной файл
> "$OUTPUT_FILE"

# ========== 1. Дерево проекта ==========
echo "===== ДЕРЕВО ПРОЕКТА =====" >> "$OUTPUT_FILE"

if command -v tree &> /dev/null; then
    tree --dirsfirst -a \
        -I 'node_modules|.next|out|dist|build|coverage|.git|.turbo|.cache|.vercel|__pycache__|.DS_Store|*.tsbuildinfo|package-lock.json|next-env.d.ts|.env|.env.*' \
        --noreport \
        >> "$OUTPUT_FILE"
else
    echo "(tree не установлен, используется упрощённый вывод)" >> "$OUTPUT_FILE"
    find . \
        -not -path "./node_modules/*" \
        -not -path "./.next/*" \
        -not -path "./out/*" \
        -not -path "./dist/*" \
        -not -path "./build/*" \
        -not -path "./coverage/*" \
        -not -path "./.git/*" \
        -not -path "./.turbo/*" \
        -not -path "./.cache/*" \
        -not -path "./.vercel/*" \
        -not -path "./__pycache__/*" \
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

# ========== 2. Содержимое файлов ==========
echo "===== СОДЕРЖИМОЕ ФАЙЛОВ =====" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

# Функция для обработки одного файла
process_file() {
    local file="$1"

    # Пропускаем папки (обрабатываем только файлы)
    [[ -f "$file" ]] || return

    # Защита от секретов
    if is_secret_file "$file"; then
        echo "Пропускаем секретный файл: $file" >&2
        SKIP_SECRET=$((SKIP_SECRET + 1)); return
    fi

    # Защита от бинарников (тихо: их много в app/icon.png и public/)
    if is_binary_file "$file"; then
        SKIP_BINARY=$((SKIP_BINARY + 1)); return
    fi

    # Защита от мусора
    if is_junk_file "$file"; then
        SKIP_JUNK=$((SKIP_JUNK + 1)); return
    fi

    # Защита от гигантов
    local size
    size=$(stat -c %s "$file" 2>/dev/null || stat -f %z "$file" 2>/dev/null || echo 0)
    if (( size > MAX_FILE_BYTES )); then
        echo "Пропускаем слишком большой файл ($size байт): $file" >&2
        SKIP_BIG=$((SKIP_BIG + 1)); return
    fi

    echo "Добавляем: $file" >&2
    echo "===== $file =====" >> "$OUTPUT_FILE"
    cat "$file" >> "$OUTPUT_FILE"
    printf "\n\n" >> "$OUTPUT_FILE"
    ADDED=$((ADDED + 1))
}

# Собираем файлы из указанных папок (сортировка — стабильный порядок для дифов)
for dir in "${INCLUDE_DIRS[@]}"; do
    if [[ -d "$dir" ]]; then
        while IFS= read -r -d '' file; do
            process_file "$file"
        done < <(find "$dir" -type f \
                    -not -path "*/.git/*" \
                    -not -path "*/node_modules/*" \
                    -not -path "*/.next/*" -print0 | sort -z)
    else
        echo "Предупреждение: папка '$dir' не найдена, пропускаем" >&2
    fi
done

# Добавляем корневые файлы
for file in "${INCLUDE_ROOT_FILES[@]}"; do
    process_file "$file"
done

echo "Готово! Результат сохранён в $OUTPUT_FILE" >&2
echo "Добавлено: $ADDED | пропущено: секретных=$SKIP_SECRET, бинарных=$SKIP_BINARY, служебных=$SKIP_JUNK, больших=$SKIP_BIG" >&2
echo "Размер файла: $(du -h "$OUTPUT_FILE" | cut -f1)" >&2