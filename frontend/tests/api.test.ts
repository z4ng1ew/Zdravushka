import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/api/ApiError";
import { sendChat } from "@/shared/api/chat";
import { describe as describeStatus, logError, readErrors, toLogText } from "@/shared/api/errorLog";
import { request } from "@/shared/api/http";

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

describe("request — единая точка запросов", () => {
  it("ошибка сервера → ApiError с кодом и текстом detail, запись в журнал", async () => {
    vi.stubGlobal("fetch", answer(503, { detail: "МИС не отвечает" }));
    await expect(request("GET", "/api/calls", "тест")).rejects.toMatchObject({ status: 503, message: "МИС не отвечает" });
    expect(readErrors()[0]).toMatchObject({ status: 503, path: "/api/calls", where: "тест" });
  });
  it("нет сети → ApiError без кода", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    const e = await request<unknown>("GET", "/api/health", "тест").then(() => null, (x: ApiError) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect(e?.status).toBeNull();
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
