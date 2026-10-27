// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePolling } from "@/shared/hooks/usePolling";
import { useCallTimer } from "@/features/call/hooks/useCallTimer";
import { useChatSender } from "@/features/call/hooks/useChatSender";
import type { ChatResponse } from "@/shared/types/chat";
import { reply } from "./fixtures";

const chat = vi.hoisted(() => ({ sendChat: vi.fn() }));
vi.mock("@/shared/api/chat", () => chat);

/** Обещание, которое разрешаем вручную — «сервер ответил позже» */
function later<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

beforeEach(() => { vi.useFakeTimers(); chat.sendChat.mockReset(); });
afterEach(() => { vi.useRealTimers(); });

describe("usePolling — опрос сервера", () => {
  it("пока прошлый запрос не ответил, новый не уходит (медленный сервер не копит очередь)", async () => {
    const slow = later<number>();
    const load = vi.fn(() => slow.promise);
    renderHook(() => usePolling(load, 1000));
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(load).toHaveBeenCalledTimes(1);
    await act(async () => { slow.resolve(1); await vi.advanceTimersByTimeAsync(1000); });
    expect(load).toHaveBeenCalledTimes(2);
  });
  it("refresh() во время запроса — повторяем сразу после ответа, один раз", async () => {
    const first = later<number>();
    const load = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue(2);
    const { result } = renderHook(() => usePolling(load, 60_000));
    act(() => { result.current.refresh(); result.current.refresh(); });
    await act(async () => { first.resolve(1); await vi.advanceTimersByTimeAsync(0); });
    expect(load).toHaveBeenCalledTimes(2);
    expect(result.current.data).toBe(2);
  });
});

describe("usePolling — вкладка скрыта: опрос на паузе", () => {
  const setVisibility = (v: "visible" | "hidden") => {
    Object.defineProperty(document, "visibilityState", { value: v, configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  };
  afterEach(() => { setVisibility("visible"); });
  it("скрыта — запросов нет; вернулись — один запрос сразу, дальше по расписанию", async () => {
    const load = vi.fn(async () => 1);
    renderHook(() => usePolling(load, 30_000));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(load).toHaveBeenCalledTimes(1);
    act(() => { setVisibility("hidden"); });
    await act(async () => { await vi.advanceTimersByTimeAsync(5 * 60_000); }); // 5 минут в фоне
    expect(load).toHaveBeenCalledTimes(1);
    await act(async () => { setVisibility("visible"); await vi.advanceTimersByTimeAsync(0); });
    expect(load).toHaveBeenCalledTimes(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(29_000); });
    expect(load).toHaveBeenCalledTimes(2); // расписание пошло заново от возврата
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    expect(load).toHaveBeenCalledTimes(3);
  });
  it("вкладку открыли в фоне — первый запрос, только когда её покажут", async () => {
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    const load = vi.fn(async () => 1);
    renderHook(() => usePolling(load, 30_000));
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(load).not.toHaveBeenCalled();
    await act(async () => { setVisibility("visible"); await vi.advanceTimersByTimeAsync(0); });
    expect(load).toHaveBeenCalledTimes(1);
  });
});

describe("useChatSender — ответ старого звонка", () => {
  it("ответ, пришедший после «Заново», не попадает в новый звонок и не меняет сессию", async () => {
    const old = later<ChatResponse>();
    chat.sendChat.mockReturnValueOnce(old.promise).mockResolvedValue(reply({ session_id: "new", reply: "Здравствуйте" }));
    const dispatch = vi.fn();
    const { result } = renderHook(() => useChatSender(dispatch, "stand"));
    let stale!: Promise<ChatResponse | null>;
    act(() => { stale = result.current.send("Запишите к терапевту"); });
    act(() => { result.current.newCall(); });
    await act(async () => { await result.current.send(""); });
    await act(async () => { old.resolve(reply({ session_id: "old", reply: "Старый ответ" })); });
    expect(await stale).toBeNull();
    const replies = dispatch.mock.calls.filter(([a]) => a.type === "reply").map(([a]) => a.r.reply);
    expect(replies).toEqual(["Здравствуйте"]);
    await act(async () => { await result.current.send("да"); });
    expect(chat.sendChat).toHaveBeenLastCalledWith("new", "да", undefined);
  });
  it("ошибка старого звонка не показывается в новом", async () => {
    const old = later<ChatResponse>();
    chat.sendChat.mockReturnValueOnce(old.promise.then(() => { throw new Error("нет связи"); }));
    const dispatch = vi.fn();
    const { result } = renderHook(() => useChatSender(dispatch, "stand"));
    act(() => { void result.current.send("да"); result.current.closeCall(); });
    await act(async () => { old.resolve(reply()); await vi.advanceTimersByTimeAsync(0); });
    expect(dispatch.mock.calls.some(([a]) => a.type === "error")).toBe(false);
  });
});

describe("useCallTimer — таймер звонка", () => {
  it("считает по часам, а не по тикам, и сбрасывается на новом звонке", async () => {
    const { result, rerender } = renderHook(({ phase, no }) => useCallTimer(phase, no), {
      initialProps: { phase: "active" as const, no: 1 },
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(result.current).toBe(3);
    rerender({ phase: "active", no: 2 });
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(result.current).toBe(1);
  });
});
