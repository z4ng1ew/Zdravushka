import { describe, expect, it } from "vitest";
import { isRetryable, parseRetryAfter, retryDelay } from "@/shared/api/retry";
import { GIVE_UP, missReaction, SAY_AGAIN } from "@/features/call/model/speechMisses";

describe("retryDelay — когда повторять запрос", () => {
  it("временные сбои (503, 504, 408, нет сети): 0,5 с, потом 1,5 с, потом ошибка", () => {
    expect([0, 1, 2].map((n) => retryDelay(503, n))).toEqual([500, 1500, null]);
    expect(retryDelay(null, 0)).toBe(500);
    expect(retryDelay(408, 1)).toBe(1500);
  });
  it("429 — ждём, сколько сказал сервер, но не дольше 10 с", () => {
    expect(retryDelay(429, 0, 3000)).toBe(3000);
    expect(retryDelay(429, 0, 60_000)).toBe(10_000);
    expect(retryDelay(429, 0)).toBe(500);
  });
  it("ошибки запроса (400, 404, 409, 500) не повторяем", () => {
    expect([400, 404, 409, 500].map((s) => retryDelay(s, 0))).toEqual([null, null, null, null]);
  });
  it("повторяем только безопасные запросы: чтение и речь, но не /api/chat", () => {
    expect(isRetryable("GET", "/api/calls")).toBe(true);
    expect(isRetryable("POST", "/api/asr")).toBe(true);
    expect(isRetryable("POST", "/api/chat")).toBe(false);
    expect(isRetryable("PATCH", "/api/handoffs/1")).toBe(false);
  });
  it("Retry-After: секунды или дата", () => {
    expect(parseRetryAfter("5")).toBe(5000);
    expect(parseRetryAfter("Mon, 19 Oct 2026 10:00:10 GMT", Date.parse("Mon, 19 Oct 2026 10:00:00 GMT"))).toBe(10_000);
    expect(parseRetryAfter(null)).toBeNull();
    expect(parseRetryAfter("скоро")).toBeNull();
  });
});

describe("missReaction — речь не распознана", () => {
  it("первый промах — просим повторить и слушаем дальше", () => {
    expect(missReaction(1)).toEqual({ listen: true, notice: SAY_AGAIN });
  });
  it("второй подряд — больше не слушаем по кругу, предлагаем текст или регистратора", () => {
    expect(missReaction(2)).toEqual({ listen: false, notice: GIVE_UP });
  });
});
