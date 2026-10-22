// Проверка ответов сервера на входе: экраны получают данные нужной формы или понятную ошибку.
// Список вместо объекта, null, число вместо строки, вложенный объект в «Что понял ИИ» —
// всё это ловится здесь, а не падением страницы. Чистые функции — проверяются тестами.

/** Ответ сервера не той формы — request() превратит это в ApiError «неожиданный формат» */
export class FormatError extends Error {}

export type Raw = Record<string, unknown>;

export const isObj = (v: unknown): v is Raw => typeof v === "object" && v !== null && !Array.isArray(v);

/** Объект или FormatError */
export function obj(v: unknown, what: string): Raw {
  if (!isObj(v)) throw new FormatError(`${what}: ожидался объект`);
  return v;
}

/** Строка; число → строка; остальное → fallback */
export function str(v: unknown, fallback = ""): string {
  if (typeof v === "string") return v;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return fallback;
}

/** Строка или null (пустая строка → null) */
export const strOrNull = (v: unknown): string | null => str(v) || null;

/** Конечное число; строка с числом тоже подходит */
export function num(v: unknown, fallback = 0): number {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : fallback;
}

export function numOrNull(v: unknown): number | null {
  const n = num(v, NaN);
  return Number.isNaN(n) ? null : n;
}

/** Поля «ключ → значение» для показа: только простые значения, вложенные объекты пропускаем */
export function textRecord(v: unknown): Record<string, string> {
  if (!isObj(v)) return {};
  const out: Record<string, string> = {};
  for (const [k, x] of Object.entries(v)) {
    if (typeof x === "boolean") out[k] = x ? "да" : "нет";
    else if (str(x)) out[k] = str(x);
  }
  return out;
}

/** Список: не массив — FormatError; негодные элементы (item вернул null или бросил) пропускаем */
export function list<T>(v: unknown, item: (x: unknown) => T | null, what: string): T[] {
  if (!Array.isArray(v)) throw new FormatError(`${what}: ожидался список`);
  return v.flatMap((x) => {
    try {
      const r = item(x);
      return r === null ? [] : [r];
    } catch {
      return [];
    }
  });
}

/** То же для вложенных списков: не массив — пустой список */
export const softList = <T>(v: unknown, item: (x: unknown) => T | null): T[] =>
  Array.isArray(v) ? list(v, item, "") : [];

/** Значение из набора допустимых или fallback */
export const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(v as T) ? (v as T) : fallback;
