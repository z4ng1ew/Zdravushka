#!/bin/bash

# ============================================================
# Скрипт для сохранения структуры и кода проекта Zdravushka (бэкенд)
# ИТОГОВАЯ ВЕРСИЯ.
# В дамп попадает ТОЛЬКО важное для разработки бэка:
#   - все *.py из app/, scripts/, tests/ — собираются автоматически,
#     новые модули (ports.py, resilience.py, reminders.py, guards.py,
#     interceptors.py, session.py, understanding.py, …) не теряются;
#   - pytest.ini, run.sh, requirements.txt, requirements-dev.txt,
#     requirements.lock (точные версии — критерий «воспроизводимость»);
#   - README.md, .env.example, .gitignore, TEST_PLAN.md;
#   - scripts/build_frontend.sh, scripts/lock_requirements.sh;
#   - telephony/ (README.md, extensions.conf, pjsip.conf.example).
# Боевой pjsip.conf с SIP-паролем в дамп НЕ попадает никогда
# (страховка в is_secret_file), в дереве видно только его имя.
# Дерево «кодовое»: -P/--prune прячет .venv*, .pytest_cache, static/,
# frontend/, data/raw/, data/voices/, data/tmp/ и прочее небэкендовое.
# ============================================================

OUTPUT_FILE="project_contents.txt"

# ---------- 1. Где собираем все *.py автоматически ----------
PY_DIRS=(
    "app"
    "scripts"
    "tests"
)

# ---------- 2. Важные НЕ-питоновские файлы ----------
INCLUDE_FILES=(
    "pytest.ini"
    "run.sh"
    "requirements.txt"
    "requirements-dev.txt"
    "requirements.lock"
    "requirements-silero.txt"
    "README.md"
    ".env.example"
    ".gitignore"
    "TEST_PLAN.md"
    "scripts/build_frontend.sh"
    "scripts/lock_requirements.sh"
    "scripts/get_silero.sh"
    "telephony/README.md"
    "telephony/asterisk/extensions.conf"
    # Только если реально создадите безопасный пример:
    # "telephony/asterisk/pjsip.conf.example"
)

# ---------- 3. Фильтры дерева: только файлы разработки ----------
# Что показывать (по расширениям и именам) и что прятать (по именам)
TREE_INCLUDE='*.py|*.sh|*.md|*.ini|*.conf|*.json|*.txt|requirements.lock|.gitignore|.env.example'
TREE_EXCLUDE='__pycache__|.git|.venv*|.pytest_cache|node_modules|.next|out|dist|static|frontend|voices|raw|tmp|journal.json|project_contents.txt|save_project.sh|промпт.txt|cheat-sheet.md|TODO.MD|Instructions.md|FRONT-FILES|архив'

# Защита от случайных гигантов
MAX_FILE_BYTES=300000   # ~300 КБ

is_secret_file() {
    local name
    name="$(basename "$1")"
    # .env.example НЕ секрет — это документация по конфигурации
    [[ "$name" == ".env.example" || "$name" == ".env.sample" ]] && return 1
    # pjsip.conf содержит SIP-учётные данные гейтвея — в дамп никогда
    [[ "$name" == "pjsip.conf" ]] && return 0
    [[ "$name" == ".env" || "$name" == .env.* || "$name" == *.env || "$name" == *.env.* ]]
}

is_binary_file() {
    local name
    name="$(basename "$1")"
    # Защищаемся от таблиц, картинок, моделей и кэша
    [[ "$name" == *.xlsx || "$name" == *.xls || "$name" == *.png || "$name" == *.jpg || "$name" == *.pdf || "$name" == *.pyc || "$name" == *.onnx || "$name" == *.onnx.json ]]
}

# Убирает из дерева .env, .env.local и т. п., но ОСТАВЛЯЕТ .env.example
hide_env() {
    awk -F/ '{ b = $NF; if (b ~ /^\.env(\..*)?$/ && b != ".env.example") next; print }'
}

# Счётчики для итогового отчёта
ADDED=0; SKIP_SECRET=0; SKIP_BINARY=0; SKIP_BIG=0

# Очищаем выходной файл
> "$OUTPUT_FILE"

# ========== 1. Дерево проекта (только файлы разработки) ==========
echo "===== ДЕРЕВО ПРОЕКТА =====" >> "$OUTPUT_FILE"

if command -v tree &> /dev/null; then
    tree -a -f --dirsfirst --prune \
        -P "$TREE_INCLUDE" \
        -I "$TREE_EXCLUDE" \
        --noreport \
        | hide_env \
        >> "$OUTPUT_FILE"
else
    echo "(tree не установлен, используется упрощённый вывод)" >> "$OUTPUT_FILE"
    find . \
        \( -name '*.py' -o -name '*.sh' -o -name '*.md' -o -name '*.ini' \
           -o -name '*.conf' -o -name '*.json' -o -name '*.txt' \
           -o -name 'requirements.lock' \
           -o -name '.gitignore' -o -name '.env.example' \) \
        -not -path "*/__pycache__/*" \
        -not -path "./.git/*" \
        -not -path "./.venv*" \
        -not -path "./.pytest_cache/*" \
        -not -path "./node_modules/*" \
        -not -path "./.next/*" \
        -not -path "./out/*" \
        -not -path "./dist/*" \
        -not -path "./static/*" \
        -not -path "./frontend/*" \
        -not -path "./data/voices/*" \
        -not -path "./data/raw/*" \
        -not -path "./data/tmp/*" \
        -not -name "journal.json" \
        -not -name "project_contents.txt" \
        -not -name "save_project.sh" \
        -not -name "промпт.txt" \
        -not -name "cheat-sheet.md" \
        -not -name "TODO.MD" \
        -not -name "Instructions.md" \
        -print \
        | sed 's|^\./||' \
        | sort \
        | hide_env \
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

process_file() {
    local file="$1"
    local warn_if_missing="${2:-}"

    # Пропускаем папки (обрабатываем только файлы)
    if [[ ! -f "$file" ]]; then
        [[ -n "$warn_if_missing" ]] && echo "Предупреждение: файл '$file' не найден, пропускаем" >&2
        return
    fi

    # Защита от секретов (по имени)
    if is_secret_file "$file"; then
        echo "Пропускаем секретный файл: $file" >&2
        SKIP_SECRET=$((SKIP_SECRET + 1)); return
    fi

    # Защита от бинарников
    if is_binary_file "$file"; then
        SKIP_BINARY=$((SKIP_BINARY + 1)); return
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

# 2.1. Весь питон из ключевых папок (автосбор, сортировка — стабильный порядок)
for dir in "${PY_DIRS[@]}"; do
    if [[ -d "$dir" ]]; then
        while IFS= read -r -d '' file; do
            process_file "$file"
        done < <(find "$dir" -type f -name '*.py' \
                    -not -path "*/__pycache__/*" -print0 | sort -z)
    else
        echo "Предупреждение: папка '$dir' не найдена, пропускаем" >&2
    fi
done

# 2.2. Важные не-питоновские файлы (с предупреждением, если какого-то нет)
for file in "${INCLUDE_FILES[@]}"; do
    process_file "$file" warn
done

echo "Готово! Результат сохранён в $OUTPUT_FILE" >&2
echo "Добавлено: $ADDED | пропущено: секретных=$SKIP_SECRET, бинарных=$SKIP_BINARY, больших=$SKIP_BIG" >&2
echo "Размер: $(du -h "$OUTPUT_FILE" | cut -f1)" >&2