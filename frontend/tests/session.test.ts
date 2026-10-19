// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/api/ApiError";
import { useCallSession } from "@/features/call/hooks/useCallSession";
import { reply } from "./fixtures";

const chat = vi.hoisted(() => ({ sendChat: vi.fn() }));
vi.mock("@/shared/api/chat", () => chat);
vi.mock("@/shared/store/doctorDirectory", () => ({ loadDoctors: async () => [], doctorsNow: () => [] }));

beforeEach(() => { chat.sendChat.mockReset(); localStorage.clear(); });

describe("useCallSession — звонок пациента", () => {
  it("«Регистратор», а сервер недоступен: не обещаем «соединяю», показываем ошибку и подсказку", async () => {
    chat.sendChat.mockResolvedValueOnce(reply({ reply: "Здравствуйте" }))
      .mockRejectedValueOnce(new ApiError(null, "POST", "/api/chat", "Failed to fetch"));
    const { result } = renderHook(() => useCallSession("stand"));
    await act(async () => { await result.current.start(); });
    await act(async () => { await result.current.toRegistrar(); });
    const s = result.current.state;
    expect(s.mode).toBe("ai");
    expect(s.feed.map((f) => f.type)).toEqual(["line", "line", "error", "notice"]);
    expect(s.feed.at(-2)).toMatchObject({ type: "error", retry: "Соедините меня с регистратором" });
  });
  it("«Завершить» во время ответа сервера: опоздавший ответ не оживляет звонок", async () => {
    let answer!: (r: unknown) => void;
    chat.sendChat.mockResolvedValueOnce(reply({ reply: "Здравствуйте" })).mockReturnValueOnce(new Promise((r) => { answer = r; }));
    const { result } = renderHook(() => useCallSession("stand"));
    await act(async () => { await result.current.start(); });
    act(() => { void result.current.ask("Запишите к терапевту"); });
    act(() => { result.current.end(); });
    await act(async () => { answer(reply({ reply: "Опоздал" })); });
    const s = result.current.state;
    expect(s.phase).toBe("ended");
    expect(s.sending).toBe(false);
    expect(s.feed.some((f) => f.type === "line" && f.line.text === "Опоздал")).toBe(false);
  });
  it("приветствие не пришло — звонок завершён, без кнопки «Отправить ещё раз» (нечего повторять)", async () => {
    chat.sendChat.mockRejectedValueOnce(new ApiError(503, "POST", "/api/chat", "нет"));
    const { result } = renderHook(() => useCallSession("stand"));
    await act(async () => { await result.current.start(); });
    expect(result.current.state.phase).toBe("ended");
    expect(result.current.state.feed[0]).toMatchObject({ type: "error", status: 503, retry: undefined });
  });
});
