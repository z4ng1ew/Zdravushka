// Единственное место, где фронт ходит в сеть. Любая ошибка → ApiError + запись в журнал.
// body: объект → JSON, FormData → файл (multipart). as: "json" (по умолчанию) или "blob" (звук).

import { ApiError } from "./ApiError";
import { API_URL, TIMEOUT } from "../config";
import { describe, logError } from "./errorLog";

const timeoutFor = (path: string) =>
  /^\/api\/chat/.test(path) ? TIMEOUT.chat : /^\/api\/(asr|tts)/.test(path) ? TIMEOUT.speech : TIMEOUT.other;

function fail(status: number | null, method: string, path: string, where: string, message: string): never {
  const e = new ApiError(status, method, path, message);
  logError(e, where);
  throw e;
}

async function errorDetail(r: Response): Promise<string> {
  try {
    const j = await r.json();
    return typeof j.detail === "string" ? j.detail : j.message ?? JSON.stringify(j.detail ?? j);
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

export async function request<T>(
  method: string, path: string, where: string, body?: unknown, as: "json" | "blob" = "json",
): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutFor(path));
  let r: Response;
  try {
    r = await fetch(`${API_URL}${path}`, init(method, body, ctrl.signal));
  } catch (err) {
    if (ctrl.signal.aborted) fail(408, method, path, where, "Сервер не ответил вовремя");
    fail(null, method, path, where, err instanceof Error ? err.message : "сеть недоступна");
  } finally {
    clearTimeout(timer);
  }
  if (!r.ok) fail(r.status, method, path, where, (await errorDetail(r)) || describe(r.status));
  try {
    return (as === "blob" ? await r.blob() : await r.json()) as T;
  } catch {
    fail(r.status, method, path, where, "Сервер прислал ответ в неожиданном формате");
  }
}
