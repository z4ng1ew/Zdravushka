import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseTexts } from "@/shared/api/texts";
import { FormatError } from "@/shared/api/parse";
import { loadTexts, resetTextsForTests, subscribeTexts, textsNow } from "@/shared/store/uiTexts";
import { TEXTS } from "./fixtures";

const answer = (body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } }));

beforeEach(() => { resetTextsForTests(); vi.unstubAllGlobals(); });

describe("тексты интерфейса — GET /api/texts", () => {
  it("грузятся один раз и кэшируются; одновременные вызовы ждут один запрос", async () => {
    const f = answer(TEXTS);
    vi.stubGlobal("fetch", f);
    const [a, b] = await Promise.all([loadTexts(), loadTexts()]);
    await loadTexts();
    expect(f).toHaveBeenCalledTimes(1);
    expect(String((f.mock.calls[0] as unknown[])[0])).toMatch(/\/api\/texts$/);
    expect(a).toEqual(TEXTS);
    expect(b).toBe(a);
    expect(textsNow()).toBe(a);
  });
  it("экраны узнают, что тексты пришли (subscribe)", async () => {
    vi.stubGlobal("fetch", answer(TEXTS));
    const seen = vi.fn();
    const off = subscribeTexts(seen);
    await loadTexts();
    off();
    expect(seen).toHaveBeenCalledTimes(1);
  });
  it("сервер недоступен — ошибка, кэш пуст, следующий вызов пробует снова", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 503 })));
    await expect(loadTexts()).rejects.toMatchObject({ status: 503 });
    expect(textsNow()).toBeNull();
    const f = answer(TEXTS);
    vi.stubGlobal("fetch", f);
    await expect(loadTexts()).resolves.toEqual(TEXTS);
  }, 10_000);
  it("форма ответа: недостающее — пустой строкой, лишнее отбрасывается, не объект — ошибка формата", () => {
    const t = parseTexts({ greeting: " Здравствуйте ", hints: { say_again: "Повторите", лишнее: "x" }, mascot: "нет" });
    expect(t.greeting).toBe("Здравствуйте");
    expect(t.hints).toEqual({ say_again: "Повторите", give_up: "", not_heard: "", error: "" });
    expect(t.mascot.idle).toBe("");
    expect(t.operator_greeting).toBe("");
    expect(() => parseTexts([])).toThrow(FormatError);
  });
});
