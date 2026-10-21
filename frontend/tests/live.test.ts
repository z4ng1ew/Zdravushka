import { describe, expect, it, vi } from "vitest";
import { cleanLiveCall } from "@/shared/live/channel";
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
