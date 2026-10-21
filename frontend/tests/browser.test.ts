// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/api/ApiError";
import { useAction } from "@/shared/hooks/useAction";
import { useSpeaker } from "@/features/call/hooks/useSpeaker";
import { play } from "@/shared/browser/player";
import { micProblem } from "@/shared/browser/recorder";
import { openLive } from "@/shared/live/channel";

const speech = vi.hoisted(() => ({ synthesize: vi.fn(), recognize: vi.fn() }));
vi.mock("@/shared/api/speech", () => speech);

class FakeAudio {
  static last: FakeAudio;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  paused = false;
  constructor() { FakeAudio.last = this; }
  play() { return Promise.resolve(); }
  pause() { this.paused = true; }
}

beforeEach(() => {
  vi.stubGlobal("Audio", FakeAudio);
  URL.createObjectURL = vi.fn(() => "blob:x");
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("плеер ответа", () => {
  it("прерывание (Завершить, перехват) — звук останавливается, ожидание заканчивается", async () => {
    const ctrl = new AbortController();
    const done = play(new Blob(["x"]), ctrl.signal);
    ctrl.abort();
    await done;
    expect(FakeAudio.last.paused).toBe(true);
    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });
});

describe("useSpeaker — озвучка", () => {
  it("озвучки на сервере нет (404) — больше не пробуем и не держим паузу", async () => {
    speech.synthesize.mockRejectedValue(new ApiError(404, "POST", "/api/tts", "нет"));
    const { result } = renderHook(() => useSpeaker());
    await act(async () => { await result.current.speak("Здравствуйте"); });
    await act(async () => { await result.current.speak("Ещё"); });
    expect(speech.synthesize).toHaveBeenCalledTimes(1);
    expect(result.current.canReplay).toBe(false);
  });
  it("silence() во время речи — speaking сразу false", async () => {
    speech.synthesize.mockResolvedValue(new Blob(["x"]));
    const { result } = renderHook(() => useSpeaker());
    let p!: Promise<void>;
    await act(async () => { p = result.current.speak("Длинный ответ"); await Promise.resolve(); });
    act(() => { result.current.silence(); });
    await act(async () => { await p; });
    expect(result.current.speaking).toBe(false);
  });
});

describe("useAction — кнопки кабинета", () => {
  it("двойной клик не отправляет действие дважды; ошибка — у своей кнопки", async () => {
    let finish!: () => void;
    const fn = vi.fn(() => new Promise<void>((r) => { finish = r; }));
    const { result } = renderHook(() => useAction());
    act(() => { void result.current.run("h-1", fn); void result.current.run("h-1", fn); });
    expect(fn).toHaveBeenCalledTimes(1);
    await act(async () => { finish(); });
    await act(async () => { await result.current.run("h-2", () => Promise.reject(new ApiError(409, "PATCH", "/x", "занято"))); });
    expect(result.current.error("h-2")?.status).toBe(409);
    expect(result.current.error("h-1")).toBeNull();
  });
});

describe("микрофон и канал между вкладками", () => {
  it("страница не по https — понятная причина, а не «нет доступа»", () => {
    vi.stubGlobal("isSecureContext", false);
    expect(micProblem()).toBe("insecure");
  });
  it("после закрытия канала отправка не бросает исключение; чужие сообщения отбрасываются", async () => {
    const got = vi.fn();
    const a = openLive(got);
    const b = openLive(() => {});
    b.send({ type: "hello" });
    (new BroadcastChannel("clinicai-live")).postMessage({ type: "чужое" });
    await new Promise((r) => setTimeout(r, 20));
    expect(got).toHaveBeenCalledWith({ type: "hello" });
    expect(got).toHaveBeenCalledTimes(1);
    // состояние без номера вкладки и команда без адресата — не наши (не понять, чей звонок)
    const raw = new BroadcastChannel("clinicai-live");
    raw.postMessage({ type: "state", call: {} });
    raw.postMessage({ type: "takeover", operator: "" });
    raw.postMessage({ type: "state", call: { phase: "active" }, from: "t1" });
    await new Promise((r) => setTimeout(r, 20));
    expect(got).toHaveBeenCalledTimes(2);
    expect(got.mock.calls[1][0]).toMatchObject({ type: "state", from: "t1", call: { phase: "active" } });
    raw.close(); a.close(); b.close();
    expect(() => b.send({ type: "release", to: "t1" })).not.toThrow();
  });
});
