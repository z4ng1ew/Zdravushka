import { describe, expect, it } from "vitest";
import { agoMis, durationText, hms, keyOf, parseDT, parseKey, relDay, splitDT } from "@/shared/domain/dates";
import { countText, plural } from "@/shared/domain/plural";
import { pct, share } from "@/features/stats/format";

describe("даты МИС «ДД.ММ.ГГГГ ЧЧ:ММ»", () => {
  it("разбор и обратно", () => {
    const d = parseDT("05.11.2026 08:40");
    expect([d.getDate(), d.getMonth(), d.getHours(), d.getMinutes()]).toEqual([5, 10, 8, 40]);
    expect(keyOf(parseKey("31.12.2026"))).toBe("31.12.2026");
  });
  it("пустая или чужая строка — не падает", () => {
    expect(splitDT("")).toEqual({ date: "", time: "" });
    expect(Number.isNaN(parseDT("мусор").getTime())).toBe(false);
  });
  it("сегодня и завтра — словами", () => {
    expect(relDay(keyOf(new Date()))).toMatch(/^сегодня, /);
    expect(relDay(keyOf(new Date(Date.now() + 86_400_000)))).toMatch(/^завтра, /);
  });
  it("«N мин назад»; будущее время — «только что»", () => {
    const at = (min: number) => { const d = new Date(Date.now() - min * 60_000); return `${keyOf(d)} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
    expect(agoMis(at(-30))).toBe("только что");
    expect(agoMis(at(15))).toMatch(/^1[4-6] мин назад$/);
  });
  it("таймер «ЧЧ:ММ:СС»", () => {
    expect(hms(3725)).toBe("01:02:05");
  });
});

describe("длительность звонка", () => {
  it.each([[45, "45 с"], [125, "2 мин 5 с"], [41.7, "42 с"], [-3, "0 с"], [NaN, "0 с"]])("%s → %s", (n, want) => {
    expect(durationText(n)).toBe(want);
  });
});

describe("окончания после числа", () => {
  const F = ["поле", "поля", "полей"] as const;
  it.each([[1, "поле"], [2, "поля"], [4, "поля"], [5, "полей"], [11, "полей"], [12, "полей"], [21, "поле"], [22, "поля"], [111, "полей"], [0, "полей"]])("%s %s", (n, w) => {
    expect(plural(n, F)).toBe(w);
  });
  it("countText", () => {
    expect(countText(3, F)).toBe("3 поля");
  });
});

describe("числа на дашборде", () => {
  it("проценты с запятой, деление на ноль — «—»", () => {
    expect([pct(0.207), share(1, 3), share(5, 0)]).toEqual(["20,7%", "33,3%", "—"]);
  });
});
