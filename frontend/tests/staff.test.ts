import { describe, expect, it } from "vitest";
import { sortQueue } from "@/features/registrar/queue/queueRules";
import { dayKpi, pctDelta } from "@/shared/domain/callStats";
import { misMode } from "@/shared/domain/misMode";
import { call, handoff } from "./fixtures";

describe("misMode — плашка МИС", () => {
  it.each([["stand", "stand"], ["mock", "mock"], ["no-stand", "none"], ["???", "unknown"]])("%s → %s", (mode, want) => {
    expect(misMode({ status: "ok", mode })).toBe(want);
  });
  it("сервер недоступен", () => {
    expect(misMode(null)).toBe("unknown");
  });
});

describe("dayKpi — показатели за сегодня", () => {
  const now = new Date(2026, 9, 18, 12);
  it("считает сегодня и сравнивает со вчера", () => {
    const calls = [
      call({ started_at: "18.10.2026 09:00", result: "записан" }),
      call({ started_at: "18.10.2026 10:00", result: "переведён" }),
      call({ started_at: "17.10.2026 10:00", result: "записан" }),
    ];
    expect(dayKpi(calls, [], now)).toMatchObject({ total: 2, totalD: 100, solved: 1, solvedD: 0, passed: 1, passedD: null });
  });
  it("нет вчерашних — процент не показываем", () => {
    expect(pctDelta(5, 0)).toBeNull();
  });
});

describe("sortQueue — очередь регистратора", () => {
  const list = [
    handoff({ id: "old", created_at: "18.10.2026 08:00" }),
    handoff({ id: "urgent", created_at: "18.10.2026 07:00", urgent: true }),
    handoff({ id: "closed", created_at: "18.10.2026 09:00", status: "закрыта" }),
  ];
  it("срочные наверх, закрытые скрыты", () => {
    expect(sortQueue(list, "urgent", false).map((h) => h.id)).toEqual(["urgent", "old"]);
  });
  it("по времени, с закрытыми", () => {
    expect(sortQueue(list, "new", true).map((h) => h.id)).toEqual(["closed", "old", "urgent"]);
  });
});
