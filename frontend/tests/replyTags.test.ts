import { describe, expect, it } from "vitest";
import { replyTags } from "@/shared/domain/replyTags";
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
