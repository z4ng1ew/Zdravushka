#!/bin/bash

# ============================================================
# Скрипт для сохранения структуры и кода проекта Zdravushka_Front
# ============================================================

OUTPUT_FILE="project_contents.txt"

# ---------- СПИСОК ПАПОК И ФАЙЛОВ ДЛЯ СОХРАНЕНИЯ ----------
# Указываем папки целиком: скрипт сам найдёт в них все текстовые файлы
INCLUDE_DIRS=(
    "app"
    "components"
    "lib"
    "scripts"
    "public"
)

# Точечные файлы в корне проекта
INCLUDE_ROOT_FILES=(
    "package.json"
    "tsconfig.json"
    "next.config.mjs"
    ".gitignore"
)
# -----------------------------------------------------------

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
    [[ "$name" == "package-lock.json" || "$name" == "next-env.d.ts" || "$name" == *.tsbuildinfo || "$name" == ".DS_Store" || "$name" == "$OUTPUT_FILE" ]]
}

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
        return
    fi

    # Защита от бинарников
    if is_binary_file "$file"; then
        echo "Пропускаем бинарный файл: $file" >&2
        return
    fi

    # Защита от мусора
    if is_junk_file "$file"; then
        echo "Пропускаем служебный файл: $file" >&2
        return
    fi

    echo "Добавляем: $file" >&2
    echo "===== $file =====" >> "$OUTPUT_FILE"
    cat "$file" >> "$OUTPUT_FILE"
    printf "\n\n" >> "$OUTPUT_FILE"
}

# Собираем файлы из указанных папок
for dir in "${INCLUDE_DIRS[@]}"; do
    if [[ -d "$dir" ]]; then
        # Ищем все файлы в папке, исключая скрытые папки вроде .git
        while IFS= read -r -d '' file; do
            process_file "$file"
        done < <(find "$dir" -type f -not -path "*/.git/*" -not -path "*/node_modules/*" -not -path "*/.next/*" -print0)
    else
        echo "Предупреждение: папка '$dir' не найдена, пропускаем" >&2
    fi
done

# Добавляем корневые файлы
for file in "${INCLUDE_ROOT_FILES[@]}"; do
    process_file "$file"
done

echo "Готово! Результат сохранён в $OUTPUT_FILE" >&2
echo "Размер файла: $(du -h "$OUTPUT_FILE" | cut -f1)" >&2