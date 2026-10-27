import { describe, expect, it } from "vitest";
import { parseCall, parseTiming } from "@/shared/api/parseStaff";
import { keyOf } from "@/shared/domain/dates";
import { daySpeed, median, secText, speedSummary } from "@/shared/domain/speed";
import { call } from "./fixtures";

const t = (stt_ms: number, dialog_ms: number, stt: string | null = "mac", llm: string | null = "mac") => ({ stt_ms, dialog_ms, stt, llm });

describe("скорость ответа по фразам (timings)", () => {
  it("пусто или нет поля — строки нет", () => {
    expect(speedSummary(undefined)).toBeNull();
    expect(speedSummary([])).toBeNull();
  });
  it("среднее по stt_ms + dialog_ms, отдельно распознавание и диалог, источник по-русски", () => {
    const s = speedSummary([t(820, 1350), t(640, 90, "mac", null), t(640, 2760)]);
    expect(s?.text).toBe("Скорость: в среднем 2,1 с на фразу · распознавание 0,7 с · диалог 1,4 с · источник: наш сервер");
  });
  it("источник — самый частый из stt/llm; organizers — «шлюз организаторов», незнакомый — как прислал сервер", () => {
    expect(speedSummary([t(500, 500, "organizers", "organizers"), t(500, 500, "mac", null)])?.source).toBe("organizers");
    expect(speedSummary([t(500, 500, "organizers", "organizers")])?.text).toMatch(/источник: шлюз организаторов$/);
    expect(speedSummary([t(500, 500, "yandex", null)])?.text).toMatch(/источник: yandex$/);
    expect(speedSummary([t(500, 500, null, null)])?.text).not.toMatch(/источник/);
  });
  it("секунды с запятой и одним знаком", () => {
    expect([secText(2140), secText(90), secText(10_050)]).toEqual(["2,1 с", "0,1 с", "10,1 с"]);
  });
});

describe("медиана и плитка «Ответ ассистента»", () => {
  it("медиана: нечётное и чётное число, один долгий ответ не искажает", () => {
    expect(median([])).toBeNull();
    expect(median([3000, 1000, 2000])).toBe(2000);
    expect(median([1000, 2000, 3000, 4000])).toBe(2500);
    expect(median([1000, 1100, 1200, 11_000])).toBe(1150);
  });
  it("только сегодняшние звонки; нет timings — плитки нет (null, а не «0 с»)", () => {
    const now = new Date(2026, 9, 27, 12, 0);
    const today = `${keyOf(now)} 10:00`;
    const calls = [
      call({ id: "a", started_at: today, timings: [t(700, 1400), t(600, 900)] }),
      call({ id: "b", started_at: today }),
      call({ id: "old", started_at: "20.10.2026 10:00", timings: [t(5000, 6000)] }),
    ];
    expect(daySpeed(calls, now)).toEqual({ medianMs: 1800, phrases: 2 });
    expect(daySpeed([call({ started_at: today })], now)).toBeNull();
  });
});

describe("разбор timings из /api/calls", () => {
  it("негодные элементы пропускаем, числа ≥ 0; нет поля — нет и в звонке", () => {
    expect(parseTiming({ stt_ms: 820, dialog_ms: 1350, stt: "mac", llm: null })).toEqual({ stt_ms: 820, dialog_ms: 1350, stt: "mac", llm: null });
    expect(parseTiming({ stt_ms: -1, dialog_ms: 5 })).toBeNull();
    expect(parseTiming({ stt_ms: "820", dialog_ms: 5 })).toBeNull();
    expect(parseTiming("быстро")).toBeNull();
    const c = parseCall({ id: "c1", timings: [{ stt_ms: 1, dialog_ms: 2 }, null, { stt_ms: 3 }] });
    expect(c?.timings).toEqual([{ stt_ms: 1, dialog_ms: 2, stt: null, llm: null }]);
    expect(parseCall({ id: "c1" })).not.toHaveProperty("timings");
  });
  it("код правила перевода: rule или escalation.rule, только вида R-07", () => {
    expect(parseCall({ id: "c1", rule: "R-07" })?.rule).toBe("R-07");
    expect(parseCall({ id: "c1", escalation: { rule: " R-01 " } })?.rule).toBe("R-01");
    expect(parseCall({ id: "c1", rule: "<b>x</b>" })).not.toHaveProperty("rule");
  });
});
