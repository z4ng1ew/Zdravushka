// Копирует собранный фронт (out/) в папку static/ бэкенда.
// Путь — аргументом или переменной STATIC_DIR. По умолчанию: если фронт лежит в frontend/ внутри
// репозитория бэкенда (есть ../app/main.py) — ../static, иначе ../Zdravushka/static.
// Что положили в прошлый раз, записано в static/.frontend-files: при новой выкладке удаляем и это,
// чтобы страницы, которых больше нет (например, старый кабинет врача), не оставались на сервере.
// Чужие файлы рядом не трогаем.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve, sep } from "node:path";

const MANIFEST = ".frontend-files";
const inRepo = existsSync(resolve("../app/main.py"));
const dest = resolve(process.argv[2] || process.env.STATIC_DIR || (inRepo ? "../static" : "../Zdravushka/static"));
const src = resolve("out");
if (!existsSync(src)) {
  console.error("Нет папки out/ — сначала npm run build");
  process.exit(1);
}
mkdirSync(dest, { recursive: true });

const fresh = readdirSync(src);
const manifest = resolve(dest, MANIFEST);
const previous = existsSync(manifest) ? readFileSync(manifest, "utf-8").split("\n").filter(Boolean) : [];
// только имена верхнего уровня внутри static/ — никаких путей наружу
const safe = (name) => name && !name.includes("/") && !name.includes(sep) && name !== ".." && name !== ".";
for (const name of new Set([...previous, ...fresh])) {
  if (safe(name)) rmSync(resolve(dest, name), { recursive: true, force: true });
}
cpSync(src, dest, { recursive: true });
writeFileSync(manifest, fresh.join("\n") + "\n");
console.log(`Фронт скопирован в ${dest}`);
console.log("Перезапустите uvicorn и откройте http://localhost:8000/");
