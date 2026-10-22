import { describe, expect, it } from "vitest";
import { labelTone, replyExplain, replyTags, replyTech, understoodText } from "@/shared/domain/replyTags";
import { booking, reply } from "./fixtures";

const tags = (r: Parameters<typeof replyTags>[0]) => replyTags(r);

describe("replyTags — подпись под ответом берётся из label сервера", () => {
  it("подпись — ровно label, фронт ничего не дописывает", () => {
    const r = reply({ status: "completed", source: "МИС", booking: booking({ visit_id: 837 }), label: "✓ Записано в МИС · № записи 837" });
    expect(tags(r)).toEqual([{ text: "✓ Записано в МИС · № записи 837", tone: "ok" }]);
  });
  it("label: null или пусто — подписи нет, даже если есть запись или перевод", () => {
    expect(tags(reply({ status: "completed", booking: booking(), label: null }))).toEqual([]);
    const esc = { rule: "R-07", reason: "", priority: "", emergency: false, summary: "" };
    expect(tags(reply({ status: "handoff", escalation: esc, label: "  " }))).toEqual([]);
    expect(tags(reply({ status: "completed" }))).toEqual([]); // старый бэкенд без label
  });
  it("цвет по status: completed → ok, по регламенту → info, handoff → warn, угроза жизни и error → bad", () => {
    const tone = (r: Parameters<typeof replyTags>[0]) => labelTone(r);
    const esc = { rule: "R-01", reason: "", priority: "", emergency: false, summary: "" };
    expect(tone(reply({ status: "completed", source: "МИС" }))).toBe("ok");
    expect(tone(reply({ status: "completed", source: "регламент РГ-ТЕЛ-01" }))).toBe("info");
    expect(tone(reply({ status: "handoff", escalation: esc }))).toBe("warn");
    expect(tone(reply({ status: "handoff", escalation: { ...esc, emergency: true } }))).toBe("bad");
    expect(tone(reply({ status: "error" }))).toBe("bad");
    expect(tone(reply({ status: "in_progress" }))).toBe("muted");
  });
});

describe("под бейджем: пациенту — пояснение, регистратору — служебное", () => {
  const base = { session_id: "s", reply: "ок", intent: null, collected: {}, options: [], booking: null, escalation: null, done: false };
  const full = { ...base, explanation: "  Нашла свободное время у терапевта ", understood_by: "llm", asr_confidence: 0.874 };
  it("пациенту — только понятное пояснение, без процентов и «нейросети»", () => {
    expect(replyExplain(full)).toBe("Нашла свободное время у терапевта");
    expect(replyExplain(full)).not.toMatch(/%|нейросет|правил/);
  });
  it("регистратору — кем понято и точность из ответа сервера", () => {
    expect(replyTech(full)).toBe("понято нейросетью · распознано на 87 %");
  });
  it("правила; точности нет в ответе — берём отправленную из /api/asr", () => {
    expect(replyTech({ ...base, understood_by: "rules" }, 0.6)).toBe("понято по правилам · распознано на 60 %");
  });
  it("ничего нет (старый бэкенд, текстовый ввод) — пусто", () => {
    expect(replyExplain(base)).toBe("");
    expect(replyTech(base)).toBe("");
    expect(understoodText("  ")).toBe("");
    expect(understoodText("hybrid")).toBe("понято: hybrid");
  });
});
