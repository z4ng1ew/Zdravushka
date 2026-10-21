import { describe, expect, it, vi } from "vitest";
import { sweepCalls, upsertCall, type WebLiveCall } from "@/features/live/useLiveCall";
import { cleanLiveCall, isForMe, newTabId } from "@/shared/live/channel";
import type { LiveCall } from "@/shared/types/live";
import { toggleRow } from "@/shared/ui/toggleRow";

describe("сообщение «живого» звонка от вкладки пациента", () => {
  it("мусор — пустой звонок, а не падение «Звонка сейчас»", () => {
    expect(cleanLiveCall(null)).toMatchObject({ phase: "idle", mode: "ai", lines: [], fields: {}, seconds: 0 });
    expect(cleanLiveCall({ phase: "взлёт", lines: "нет", fields: { a: { b: 1 } } })).toMatchObject({ phase: "idle", lines: [], fields: {} });
  });
  it("реплики без текста отбрасываются, остальное сохраняется", () => {
    const c = cleanLiveCall({ phase: "active", mode: "operator", operator: "Анна", lines: [{ speaker: "bot", text: "a", at: "" }, { speaker: "bot" }] });
    expect(c).toMatchObject({ phase: "active", mode: "operator", operator: "Анна" });
    expect(c.lines).toHaveLength(1);
  });
});

describe("раскрывающаяся строка таблицы с клавиатуры", () => {
  const key = (k: string) => ({ key: k, preventDefault: vi.fn() }) as unknown as Parameters<ReturnType<typeof toggleRow>["onKeyDown"]>[0];
  it("Enter и пробел раскрывают, другие клавиши — нет", () => {
    const toggle = vi.fn();
    const p = toggleRow(false, toggle);
    p.onKeyDown(key("Enter"));
    p.onKeyDown(key(" "));
    p.onKeyDown(key("a"));
    expect(toggle).toHaveBeenCalledTimes(2);
    expect([p.tabIndex, p["aria-expanded"]]).toEqual([0, false]);
  });
});

describe("несколько пациентов в разных вкладках", () => {
  const call = (s: Partial<LiveCall> = {}): LiveCall => ({ ...cleanLiveCall({ phase: "active" }), ...s });
  it("каждая вкладка — своя карточка; порядок по первому появлению, не прыгает", () => {
    let l: WebLiveCall[] = [];
    l = upsertCall(l, "a", call({ seconds: 1 }), 1);
    l = upsertCall(l, "b", call({ seconds: 1 }), 2);
    l = upsertCall(l, "a", call({ seconds: 5 }), 3); // a обновилась — осталась первой
    expect(l.map((c) => c.id)).toEqual(["a", "b"]);
    expect(l[0].call.seconds).toBe(5);
  });
  it("кабинет открыли позже: № 1 — кто позвонил раньше, а не кто первым ответил", () => {
    let l: WebLiveCall[] = [];
    l = upsertCall(l, "later", call({ seconds: 10 }), 100_000);
    l = upsertCall(l, "earlier", call({ seconds: 60 }), 100_050);
    expect(l.map((c) => c.id)).toEqual(["earlier", "later"]);
  });
  it("вкладка без звонка (idle) убирается", () => {
    const l = upsertCall(upsertCall([], "a", call(), 1), "a", call({ phase: "idle" }), 2);
    expect(l).toEqual([]);
  });
  it("пропавшая вкладка — «завершён», через 2 минуты карточка исчезает", () => {
    const l = upsertCall([], "a", call(), 0);
    const ended = sweepCalls(l, 91_000);
    expect(ended[0].call.phase).toBe("ended");
    expect(sweepCalls(ended, 91_000 + 121_000)).toEqual([]);
    expect(sweepCalls(l, 1000)).toBe(l); // ничего не поменялось — тот же список, без лишней перерисовки
  });
  it("команда регистратора — только своей вкладке; «hello» — всем", () => {
    expect(isForMe({ type: "takeover", operator: "", to: "a" }, "a")).toBe(true);
    expect(isForMe({ type: "takeover", operator: "", to: "a" }, "b")).toBe(false);
    expect(isForMe({ type: "operator_say", text: "x", to: "b" }, "a")).toBe(false);
    expect(isForMe({ type: "hello" }, "a")).toBe(true);
    expect(newTabId()).not.toBe(newTabId());
  });
});
