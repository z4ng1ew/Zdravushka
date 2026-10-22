// Когда и через сколько повторить запрос (чистая функция — проверяется тестами).
//   Повторяем только безопасные запросы: чтение (GET) и распознавание речи. Озвучку не повторяем:
//   пациент не должен ждать паузу — при сбое ассистент просто отвечает без звука.
//   POST /api/chat не повторяем сами: повтор мог бы записать пациента дважды — для него кнопка «Повторить».
//   429 — ждём столько, сколько сказал сервер (Retry-After), но не дольше 10 с.
//   408 / 502 / 503 / 504 / нет сети — 0,5 с, потом 1,5 с. Остальные коды — сразу ошибка.

const TEMPORARY = new Set([408, 502, 503, 504]);
const BACKOFF_MS = [500, 1500];
const MAX_WAIT_MS = 10_000;

export const MAX_RETRIES = BACKOFF_MS.length;

export const isRetryable = (method: string, path: string) =>
  method === "GET" || /^\/api\/asr/.test(path);

/** Секунды или дата из заголовка Retry-After → мс; null — заголовка нет или он непонятный */
export function parseRetryAfter(value: string | null, now = Date.now()): number | null {
  if (!value) return null;
  const sec = Number(value);
  if (Number.isFinite(sec)) return Math.max(0, sec * 1000);
  const at = Date.parse(value);
  return Number.isNaN(at) ? null : Math.max(0, at - now);
}

/** Пауза перед повтором номер attempt (0, 1…) или null — больше не повторяем */
export function retryDelay(status: number | null, attempt: number, retryAfterMs: number | null = null): number | null {
  if (attempt >= MAX_RETRIES) return null;
  if (status === 429) return Math.min(retryAfterMs ?? BACKOFF_MS[attempt], MAX_WAIT_MS);
  if (status === null || TEMPORARY.has(status)) return BACKOFF_MS[attempt];
  return null;
}
