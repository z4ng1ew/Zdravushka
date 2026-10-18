// Копирует собранный фронт (out/) в папку static/ бэкенда.
// Путь — аргументом или переменной STATIC_DIR. По умолчанию: если фронт лежит в frontend/ внутри
// репозитория бэкенда (есть ../app/main.py) — ../static, иначе ../Zdravushka/static.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const inRepo = existsSync(resolve("../app/main.py"));
const dest = resolve(process.argv[2] || process.env.STATIC_DIR || (inRepo ? "../static" : "../Zdravushka/static"));
const src = resolve("out");
if (!existsSync(src)) {
  console.error("Нет папки out/ — сначала npm run build");
  process.exit(1);
}
mkdirSync(dest, { recursive: true });
// очищаем старую сборку фронта, но не трогаем чужие файлы, если они есть рядом
for (const name of readdirSync(src)) rmSync(resolve(dest, name), { recursive: true, force: true });
cpSync(src, dest, { recursive: true });
console.log(`Фронт скопирован в ${dest}`);
console.log("Перезапустите uvicorn и откройте http://localhost:8000/");
