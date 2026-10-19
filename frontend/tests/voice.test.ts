// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CallSession } from "@/features/call/hooks/useCallSession";
import { useVoiceTurns } from "@/features/call/hooks/useVoiceTurns";
import { GIVE_UP, MIC_TEXT, NOT_HEARD, SAY_AGAIN } from "@/features/call/model/speechMisses";
import { reply } from "./fixtures";

const mic = vi.hoisted(() => ({ open: vi.fn(), take: vi.fn(), cancel: vi.fn(), listening: false }));
vi.mock("@/features/call/hooks/useMicrophone", () => ({ useMicrophone: () => mic }));
const speech = vi.hoisted(() => ({ recognize: vi.fn(), synthesize: vi.fn() }));
vi.mock("@/shared/api/speech", () => speech);
const speaker = vi.hoisted(() => ({ speak: vi.fn(async () => {}), silence: vi.fn(), speaking: false, canReplay: true }));
vi.mock("@/features/call/hooks/useSpeaker", () => ({ useSpeaker: () => speaker }));

let pause: () => void = () => {};
const phrase = (heard = true) => ({ audio: new Blob(["x"]), heard });

function fakeCall() {
  return {
    ref: { current: { phase: "active", mode: "ai", sending: false } },
    ask: vi.fn(async () => reply()), notice: vi.fn(), showError: vi.fn(), start: vi.fn(async () => reply()),
  } as unknown as CallSession & { ask: ReturnType<typeof vi.fn>; notice: ReturnType<typeof vi.fn> };
}

beforeEach(() => {
  vi.clearAllMocks();
  mic.open.mockImplementation(async (cb: () => void) => { pause = cb; return null; });
});

describe("голосовой цикл", () => {
  it("фраза, распознанная уже после «Завершить», не уходит боту", async () => {
    const call = fakeCall();
    let heard!: (v: { text: string; confidence: null }) => void;
    speech.recognize.mockReturnValue(new Promise((r) => { heard = r; }));
    mic.take.mockResolvedValue(phrase());
    const { result } = renderHook(() => useVoiceTurns(call));
    await act(async () => { result.current.press(); });
    await act(async () => { pause(); });
    act(() => { result.current.stop(); });
    await act(async () => { heard({ text: "да", confidence: null }); });
    expect(call.ask).not.toHaveBeenCalled();
    expect(speaker.silence).toHaveBeenCalled();
  });
  it("два промаха распознавания подряд — подсказка и микрофон больше не крутится по кругу", async () => {
    const call = fakeCall();
    speech.recognize.mockResolvedValue({ text: "", confidence: null });
    mic.take.mockResolvedValue(phrase());
    const { result } = renderHook(() => useVoiceTurns(call));
    await act(async () => { result.current.press(); });
    await act(async () => { pause(); });
    await act(async () => { pause(); });
    expect(call.notice.mock.calls.map(([t]) => t)).toEqual([SAY_AGAIN, GIVE_UP]);
    expect(mic.open).toHaveBeenCalledTimes(2);
  });
  it("полминуты тишины — микрофон выключается с подсказкой, без отправки на распознавание", async () => {
    const call = fakeCall();
    mic.take.mockResolvedValue(phrase(false));
    const { result } = renderHook(() => useVoiceTurns(call));
    await act(async () => { result.current.press(); });
    await act(async () => { pause(); });
    await act(async () => { pause(); });
    expect(call.notice.mock.calls.map(([t]) => t)).toEqual([NOT_HEARD]);
    expect(speech.recognize).not.toHaveBeenCalled();
  });
  it("сайт открыт по http — подсказка про https, а не «разрешите микрофон»", async () => {
    const call = fakeCall();
    mic.open.mockResolvedValue("insecure");
    const { result } = renderHook(() => useVoiceTurns(call));
    await act(async () => { result.current.press(); });
    expect(call.notice).toHaveBeenCalledWith(MIC_TEXT.insecure);
  });
  it("распознанная фраза уходит боту, ответ озвучивается и снова слушаем", async () => {
    const call = fakeCall();
    speech.recognize.mockResolvedValue({ text: "запишите к терапевту", confidence: 0.9 });
    mic.take.mockResolvedValue(phrase());
    const { result } = renderHook(() => useVoiceTurns(call));
    await act(async () => { result.current.press(); });
    await act(async () => { pause(); });
    expect(call.ask).toHaveBeenCalledWith("запишите к терапевту", "запишите к терапевту", 0.9);
    expect(speaker.speak).toHaveBeenCalledWith("Готово");
    expect(mic.open).toHaveBeenCalledTimes(2);
  });
});
