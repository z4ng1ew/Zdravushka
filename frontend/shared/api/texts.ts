// Тексты интерфейса: GET /api/texts → UiTexts. Форма проверяется: недостающее — пустой строкой
// (пустой текст фронт не показывает), не объект — ошибка 502.

import type { HintKey, MascotKey, UiTexts } from "../types/texts";
import { request } from "./http";
import { isObj, obj, str } from "./parse";

const HINTS: HintKey[] = ["say_again", "give_up", "not_heard", "error"];
const MASCOT: MascotKey[] = ["idle", "thinking", "error", "done", "escalated"];

function pick<K extends string>(v: unknown, keys: K[]): Record<K, string> {
  const src = isObj(v) ? v : {};
  return Object.fromEntries(keys.map((k) => [k, str(src[k]).trim()])) as Record<K, string>;
}

export function parseTexts(raw: unknown): UiTexts {
  const d = obj(raw, "ответ /api/texts");
  return {
    assistant_name: str(d.assistant_name).trim(),
    greeting: str(d.greeting).trim(),
    goodbye: str(d.goodbye).trim(),
    operator_greeting: str(d.operator_greeting).trim(),
    hints: pick(d.hints, HINTS),
    mascot: pick(d.mascot, MASCOT),
  };
}

export const getTexts = (): Promise<UiTexts> =>
  request("GET", "/api/texts", "тексты интерфейса", { parse: parseTexts });
