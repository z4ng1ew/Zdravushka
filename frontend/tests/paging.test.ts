// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { pageOf } from "@/shared/domain/paging";
import { play } from "@/shared/browser/player";

const list = Array.from({ length: 23 }, (_, i) => i + 1);

describe("pageOf — страницы длинного списка", () => {
  it("первая, средняя и последняя страница", () => {
    expect(pageOf(list, 1, 10)).toMatchObject({ items: list.slice(0, 10), page: 1, pages: 3, from: 1, to: 10, total: 23 });
    expect(pageOf(list, 3, 10)).toMatchObject({ items: [21, 22, 23], from: 21, to: 23 });
  });
  it("номер страницы за пределами — ближайшая существующая (список стал короче после обновления)", () => {
    expect(pageOf(list, 9, 10).page).toBe(3);
    expect(pageOf(list, 0, 10).page).toBe(1);
    expect(pageOf(list, NaN, 10).page).toBe(1);
  });
  it("пустой список — одна пустая страница", () => {
    expect(pageOf([], 1, 10)).toEqual({ items: [], page: 1, pages: 1, from: 0, to: 0, total: 0 });
  });
});

describe("звук не накладывается", () => {
  it("новый ответ останавливает предыдущий, даже без сигнала отмены", async () => {
    const played: { paused: boolean; onended: null | (() => void) }[] = [];
    vi.stubGlobal("Audio", class {
      paused = false; onended: null | (() => void) = null; onerror = null;
      constructor() { played.push(this); }
      play() { return Promise.resolve(); }
      pause() { this.paused = true; }
    });
    URL.createObjectURL = vi.fn(() => "blob:x");
    URL.revokeObjectURL = vi.fn();
    const first = play(new Blob(["a"]));
    const second = play(new Blob(["b"]));
    await first;
    expect(played[0].paused).toBe(true);
    expect(played[1].paused).toBe(false);
    played[1].onended?.();
    await second;
    vi.unstubAllGlobals();
  });
});
