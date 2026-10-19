import { describe, expect, it } from "vitest";
import { FormatError, list, num, numOrNull, oneOf, softList, str, textRecord } from "@/shared/api/parse";
import { parseAsr, parseChat, parseHealth, toConfidence } from "@/shared/api/parseChat";

describe("простые значения из ответа сервера", () => {
  it("str: строка, число → строка, остальное → запасное значение", () => {
    expect([str("а"), str(5), str(null), str({}), str(NaN, "—")]).toEqual(["а", "5", "", "", "—"]);
  });
  it("num / numOrNull: числа и строки с числом; мусор — запасное значение или null", () => {
    expect([num("12"), num("x", 7), num(Infinity, 1)]).toEqual([12, 7, 1]);
    expect([numOrNull("3"), numOrNull(""), numOrNull(null), numOrNull("abc")]).toEqual([3, null, null, null]);
  });
  it("textRecord: только простые значения — вложенный объект не уронит «Что понял Здравушка»", () => {
    expect(textRecord({ "врач": "терапевт", "возраст": 40, "срочно": true, "вложено": { a: 1 }, "пусто": null }))
      .toEqual({ "врач": "терапевт", "возраст": "40", "срочно": "да" });
    expect(textRecord("строка")).toEqual({});
  });
  it("list: не список — ошибка формата; негодные элементы пропускаются", () => {
    expect(() => list({ a: 1 }, (x) => x, "звонки")).toThrow(FormatError);
    expect(list([1, null, 3], (x) => (typeof x === "number" ? x * 2 : null), "числа")).toEqual([2, 6]);
    expect(list([1, 2], (x) => { if (x === 1) throw new Error("плохой"); return x; }, "числа")).toEqual([2]);
  });
  it("softList: вложенный список, которого нет, — пустой", () => {
    expect(softList(undefined, (x) => x)).toEqual([]);
  });
  it("oneOf: только допустимые значения", () => {
    expect([oneOf("bot", ["bot", "patient"] as const, "patient"), oneOf("робот", ["bot"] as const, "bot")]).toEqual(["bot", "bot"]);
  });
});

describe("parseChat — ответ /api/chat", () => {
  it("null вместо объекта — ошибка формата, а не падение экрана", () => {
    expect(() => parseChat(null)).toThrow(FormatError);
    expect(() => parseChat([])).toThrow(FormatError);
  });
  it("пустые и чужие поля — значения по умолчанию", () => {
    const r = parseChat({ session_id: 7, reply: null, options: "нет", booking: "строка", done: "true", status: 1 });
    expect(r).toMatchObject({ session_id: "7", reply: "", options: [], booking: null, done: false, status: "1", escalation: null });
  });
  it("запись и экстренный перевод разбираются полностью", () => {
    const r = parseChat({
      reply: "Готово", booking: { visit_id: "12", doctor_name: "Иванова", scheduled_at: "20.10.2026 10:00", status: "Запланирована" },
      escalation: { rule: "R-01", emergency: true }, collected: { "фамилия": "Петров" },
    });
    expect(r.booking).toMatchObject({ visit_id: 12, doctor_name: "Иванова", spoken: null });
    expect(r.escalation).toMatchObject({ rule: "R-01", emergency: true, reason: "" });
    expect(r.collected).toEqual({ "фамилия": "Петров" });
  });
});

describe("уверенность распознавания", () => {
  it.each([[0.92, 0.92], [92, 0.92], [0, 0], [-1, null], [150, null], ["abc", null], [null, null]])("%s → %s", (v, want) => {
    expect(toConfidence(v)).toBe(want);
  });
  it("parseAsr: текст обрезается, confidence приводится", () => {
    expect(parseAsr({ text: "  да  ", confidence: 87 })).toEqual({ text: "да", confidence: 0.87 });
    expect(() => parseAsr("да")).toThrow(FormatError);
  });
});

describe("parseHealth", () => {
  it("лишнее отбрасывается, флаги — только логические", () => {
    expect(parseHealth({ status: "ok", mode: "mock", llm: "да", pd_trusted_ai_only: true, tts: { x: 1 } }))
      .toMatchObject({ status: "ok", mode: "mock", llm: undefined, pd_trusted_ai_only: true, tts: null });
  });
});
