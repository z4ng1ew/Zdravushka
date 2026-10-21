// Единственное место, где фронт ходит в сеть. Любая ошибка → ApiError + запись в журнал.
// opts.body: объект → JSON, FormData → файл (multipart). opts.as: "json" (по умолчанию) или "blob" (звук).
// opts.parse: проверка формы ответа (shared/api/parse*.ts) — не та форма → 502 «неожиданный формат».

import { ApiError } from "./ApiError";
import { API_URL, TIMEOUT } from "../config";
import { describe, logError } from "./errorLog";
import { FormatError } from "./parse";
import { isRetryable, parseRetryAfter, retryDelay } from "./retry";

export interface RequestOptions<T> {
  body?: unknown;
  as?: "json" | "blob";
  parse?: (raw: unknown) => T;
}

type Failure = ApiError & { retryAfterMs?: number | null; final?: boolean };

const BAD_FORMAT = "Сервер прислал ответ в неожиданном формате";

const timeoutFor = (path: string) =>
  /^\/api\/chat/.test(path) ? TIMEOUT.chat : /^\/api\/(asr|tts)/.test(path) ? TIMEOUT.speech : TIMEOUT.other;

/** Причина ошибки от сервера: detail или message; список ошибок проверки (422) — текстом; нет — пусто */
async function errorDetail(r: Response): Promise<string> {
  try {
    const j: unknown = await r.json();
    if (typeof j !== "object" || j === null) return "";
    const { detail, message } = j as { detail?: unknown; message?: unknown };
    if (typeof detail === "string") return detail;
    if (typeof message === "string") return message;
    return detail === undefined ? "" : JSON.stringify(detail);
  } catch {
    return r.statusText; // тело не JSON
  }
}

/** Параметры fetch: без кэша, только свой сервер; JSON или FormData (аудио для /api/asr) */
function init(method: string, body: unknown, signal: AbortSignal): RequestInit {
  const base: RequestInit = { method, cache: "no-store", credentials: "same-origin", signal };
  if (body === undefined) return base;
  if (typeof FormData !== "undefined" && body instanceof FormData) return { ...base, body };
  return { ...base, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

/** Тело ответа: таймаут действует и здесь — сервер мог прислать заголовки и зависнуть */
async function readBody<T>(r: Response, method: string, path: string, opts: RequestOptions<T>, signal: AbortSignal): Promise<T> {
  let raw: unknown;
  try {
    raw = opts.as === "blob" ? await r.blob() : await r.json();
  } catch {
    if (signal.aborted) throw new ApiError(408, method, path, "Сервер не ответил вовремя");
    throw Object.assign(new ApiError(502, method, path, BAD_FORMAT), { final: true });
  }
  try {
    return opts.parse ? opts.parse(raw) : (raw as T);
  } catch (e) {
    const what = e instanceof FormatError ? `: ${e.message}` : "";
    throw Object.assign(new ApiError(502, method, path, BAD_FORMAT + what), { final: true });
  }
}

/** Одна попытка. Ошибка → ApiError (без записи в журнал — это делает request) */
async function attempt<T>(method: string, path: string, opts: RequestOptions<T>): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutFor(path));
  try {
    let r: Response;
    try {
      r = await fetch(`${API_URL}${path}`, init(method, opts.body, ctrl.signal));
    } catch (err) {
      if (ctrl.signal.aborted) throw new ApiError(408, method, path, "Сервер не ответил вовремя");
      throw new ApiError(null, method, path, err instanceof Error ? err.message : "сеть недоступна");
    }
    if (!r.ok) {
      const e = new ApiError(r.status, method, path, (await errorDetail(r)) || describe(r.status));
      throw Object.assign(e, { retryAfterMs: parseRetryAfter(r.headers.get("Retry-After")) });
    }
    return await readBody(r, method, path, opts, ctrl.signal);
  } finally {
    clearTimeout(timer);
  }
}

const sleep = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

/** Запрос к бэкенду: временные сбои безопасных запросов повторяем (shared/api/retry.ts), итог — в журнал */
export async function request<T>(method: string, path: string, where: string, opts: RequestOptions<T> = {}): Promise<T> {
  for (let n = 0; ; n++) {
    try {
      return await attempt<T>(method, path, opts);
    } catch (e) {
      const err = e as Failure;
      const wait = isRetryable(method, path) && !err.final ? retryDelay(err.status, n, err.retryAfterMs) : null;
      if (wait === null) { logError(err, where); throw err; }
      await sleep(wait);
    }
  }
}
