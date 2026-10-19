import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/api/ApiError";
import { sendChat } from "@/shared/api/chat";
import { describe as describeStatus, logError, readErrors, toLogText } from "@/shared/api/errorLog";
import { request } from "@/shared/api/http";
import { getLiveCalls } from "@/shared/api/staff";

// Простое хранилище вместо localStorage браузера
function fakeStorage() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
}
const answer = (status: number, body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));

beforeEach(() => {
  vi.stubGlobal("localStorage", fakeStorage());
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

/** Запрос с повторами: прокручиваем паузы между попытками без настоящего ожидания */
async function settle<T>(p: Promise<T>): Promise<T | ApiError> {
  const r = p.then((x) => x, (e: ApiError) => e);
  await vi.runAllTimersAsync();
  return r;
}

describe("request — единая точка запросов", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("ошибка сервера → ApiError с кодом и текстом detail, в журнал один раз", async () => {
    vi.stubGlobal("fetch", answer(500, { detail: "Ошибка МИС" }));
    expect(await settle(request("GET", "/api/calls", "тест"))).toMatchObject({ status: 500, message: "Ошибка МИС" });
    expect(readErrors()).toHaveLength(1);
    expect(readErrors()[0]).toMatchObject({ status: 500, path: "/api/calls", where: "тест" });
  });
  it("нет сети → две повторные попытки, потом ApiError без кода", async () => {
    const f = vi.fn(async () => { throw new TypeError("Failed to fetch"); });
    vi.stubGlobal("fetch", f);
    const e = await settle(request<unknown>("GET", "/api/health", "тест"));
    expect(e).toBeInstanceOf(ApiError);
    expect((e as ApiError).status).toBeNull();
    expect(f).toHaveBeenCalledTimes(3);
  });
  it("503, потом успех — экран получает данные, ошибки в журнале нет", async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(new Response("{}", { status: 503 }))
      .mockResolvedValueOnce(new Response("[1]", { status: 200 }));
    vi.stubGlobal("fetch", f);
    expect(await settle(request("GET", "/api/calls", "тест"))).toEqual([1]);
    expect(readErrors()).toHaveLength(0);
  });
  it("429 с Retry-After — ждём указанное время и повторяем", async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(new Response("{}", { status: 429, headers: { "Retry-After": "2" } }))
      .mockResolvedValueOnce(new Response("[]", { status: 200 }));
    vi.stubGlobal("fetch", f);
    const p = request("GET", "/api/live", "тест");
    await vi.advanceTimersByTimeAsync(1900);
    expect(f).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(200);
    expect(await p).toEqual([]);
  });
  it("POST /api/chat при сбое не повторяется (чтобы не записать дважды)", async () => {
    const f = answer(503, {});
    vi.stubGlobal("fetch", f);
    await settle(sendChat("s1", "да"));
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("ответ не JSON → понятная ошибка, а не падение экрана", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>", { status: 200 })));
    await expect(request("GET", "/api/calls", "тест")).rejects.toMatchObject({ message: "Сервер прислал ответ в неожиданном формате" });
  });
});

describe("sendChat — пустые поля ответа не ломают экран", () => {
  it("недостающие поля заполняются значениями по умолчанию", async () => {
    vi.stubGlobal("fetch", answer(200, { session_id: "s1", reply: "Здравствуйте" }));
    const r = await sendChat(null, "");
    expect(r).toMatchObject({ session_id: "s1", options: [], booking: null, escalation: null, done: false, status: null, source: null });
  });
});

describe("getLiveCalls — «Звонок сейчас» (GET /api/live)", () => {
  it("пустой массив — звонков нет", async () => {
    const f = answer(200, []);
    vi.stubGlobal("fetch", f);
    expect(await getLiveCalls()).toEqual([]);
    expect(String((f.mock.calls[0] as unknown[])[0])).toMatch(/\/api\/live$/);
  });
});

describe("журнал ошибок", () => {
  const err = () => new ApiError(500, "GET", "/api/calls", "Ошибка сервера");
  it("одинаковая ошибка подряд пишется один раз (опрос при упавшем сервере)", () => {
    logError(err(), "опрос");
    logError(err(), "опрос");
    expect(readErrors()).toHaveLength(1);
  });
  it("коды переводятся в понятный текст", () => {
    expect(describeStatus(null)).toBe("Нет связи с сервером");
    expect(describeStatus(599)).toBe("Ошибка сервера");
  });
  it("выгрузка .log: строка на ошибку", () => {
    logError(err(), "опрос");
    expect(toLogText(readErrors()).trim().split("\n")).toHaveLength(3);
  });
});
