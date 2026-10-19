import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/api/ApiError";
import { readErrors } from "@/shared/api/errorLog";
import { request } from "@/shared/api/http";
import { synthesize } from "@/shared/api/speech";
import { getCalls } from "@/shared/api/staff";

function fakeStorage() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
}

/** Ответ, у которого заголовки пришли, а тело «зависло»: читается, только пока запрос не отменили */
function hangingBody(init?: RequestInit) {
  return {
    ok: true, status: 200, statusText: "OK", headers: new Headers(),
    json: () => new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))),
  } as unknown as Response;
}

async function settle<T>(p: Promise<T>): Promise<T | ApiError> {
  const r = p.then((x) => x, (e: ApiError) => e);
  await vi.runAllTimersAsync();
  return r;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("localStorage", fakeStorage());
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("request — краевые случаи сети", () => {
  it("сервер прислал заголовки и завис на теле — через таймаут ошибка 408, а не вечное ожидание", async () => {
    const f = vi.fn(async (_url: string, init?: RequestInit) => hangingBody(init));
    vi.stubGlobal("fetch", f);
    const e = await settle(request("POST", "/api/reminders/run", "тест"));
    expect(e).toMatchObject({ status: 408 });
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("вместо списка пришёл объект — 502 «неожиданный формат», без повторов, в журнале", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ detail: "ok" }), { status: 200 }));
    vi.stubGlobal("fetch", f);
    const e = await settle(getCalls());
    expect(e).toMatchObject({ status: 502 });
    expect((e as ApiError).message).toMatch(/неожиданном формате: звонки/);
    expect(f).toHaveBeenCalledTimes(1);
    expect(readErrors()[0]).toMatchObject({ status: 502, path: "/api/calls" });
  });
  it("испорченные строки журнала пропускаются, хорошие доходят до экрана", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify([{ id: "c1" }, null, { nope: 1 }]), { status: 200 })));
    const calls = await settle(getCalls());
    expect(Array.isArray(calls) && calls.map((c) => c.id)).toEqual(["c1"]);
  });
  it("озвучка не повторяется при сбое — пациент не ждёт лишние секунды", async () => {
    const f = vi.fn(async () => new Response("{}", { status: 503 }));
    vi.stubGlobal("fetch", f);
    await settle(synthesize("Здравствуйте"));
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("detail ошибки — объект: показываем его текстом, а не «[object Object]»", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ detail: [{ msg: "field required" }] }), { status: 422 })));
    const e = await settle(request("POST", "/api/chat", "тест", { body: {} }));
    expect((e as ApiError).message).toContain("field required");
  });
  it("тело ошибки null — понятный текст по коду", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("null", { status: 404, statusText: "" })));
    const e = await settle(request("PATCH", "/api/handoffs/x", "тест", { body: {} }));
    expect(e).toMatchObject({ status: 404, message: "Не найдено (на сервере нет такого адреса)" });
  });
});
