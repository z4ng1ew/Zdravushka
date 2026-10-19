import { describe, expect, it } from "vitest";
import { replyNote, replyTags, understoodText } from "@/shared/domain/replyTags";
import { booking, reply } from "./fixtures";

const text = (r: Parameters<typeof replyTags>[0]) => replyTags(r, "stand").map((t) => t.text);

describe("replyTags — бейдж под ответом Здравушки", () => {
  it("in_progress — без бейджа", () => {
    expect(text(reply({ status: "in_progress" }))).toEqual([]);
  });
  it("error — сбой и перевод", () => {
    expect(text(reply({ status: "error" }))).toEqual(["⚠ Сбой, соединяем с регистратором"]);
  });
  it("handoff с угрозой жизни — 103 и правило", () => {
    const esc = { rule: "R-01", reason: "", priority: "", emergency: true, summary: "" };
    expect(text(reply({ status: "handoff", escalation: esc }))).toEqual(["🚑 Срочно: 103 · R-01"]);
  });
  it("completed из МИС — что сделано и номер записи", () => {
    expect(text(reply({ status: "completed", source: "МИС", booking: booking() }))).toEqual(["✓ Записано в МИС · № записи 7"]);
  });
  it("отмена всегда «Отменено», даже при intent booking", () => {
    const r = reply({ status: "completed", source: "МИС", booking: booking({ status: "Отменена" }) });
    expect(text(r)[0]).toMatch(/^✓ Отменено в МИС/);
  });
  it("ответ по регламенту", () => {
    expect(text(reply({ status: "completed", source: "регламент РГ-ТЕЛ-01" }))).toEqual(["📄 Ответ по регламенту"]);
  });
  it("неизвестный статус показывается как прислал сервер", () => {
    expect(text(reply({ status: "paused" }))).toEqual(["paused"]);
  });
});

describe("пояснение под бейджем (explanation · understood_by · asr_confidence)", () => {
  const base = { session_id: "s", reply: "ок", intent: null, collected: {}, options: [], booking: null, escalation: null, done: false };
  it("всё есть — через точку, проценты из ответа сервера", () => {
    expect(replyNote({ ...base, explanation: "Нашла свободное время у терапевта", understood_by: "llm", asr_confidence: 0.874 }))
      .toBe("Нашла свободное время у терапевта · понято нейросетью · распознано на 87 %");
  });
  it("правила; точности нет в ответе — берём отправленную из /api/asr", () => {
    expect(replyNote({ ...base, understood_by: "rules" }, 0.6)).toBe("понято по правилам · распознано на 60 %");
  });
  it("ничего нет (старый бэкенд, текстовый ввод) — пусто", () => {
    expect(replyNote(base)).toBe("");
    expect(understoodText("  ")).toBe("");
    expect(understoodText("hybrid")).toBe("понято: hybrid");
  });
});
