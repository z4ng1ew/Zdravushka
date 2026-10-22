// @vitest-environment jsdom
// Голосовой цикл: подсказки пациенту — тексты с сервера, шум в паузах.
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CallSession } from "@/features/call/hooks/useCallSession";
import { useVoiceTurns } from "@/features/call/hooks/useVoiceTurns";
import { MAX_NOISE_TURNS, NOT_HEARD } from "@/features/call/model/speechMisses";
import { resetTextsForTests } from "@/shared/store/uiTexts";
import { reply, TEXTS } from "./fixtures";

const mic = vi.hoisted(() => ({ open: vi.fn(), take: vi.fn(), cancel: vi.fn(), listening: false }));
vi.mock("@/features/call/hooks/useMicrophone", () => ({ useMicrophone: () => mic }));
const speech = vi.hoisted(() => ({ recognize: vi.fn(), synthesize: vi.fn() }));
vi.mock("@/shared/api/speech", () => speech);
const speaker = vi.hoisted(() => ({ speak: vi.fn(async () => {}), silence: vi.fn(), busy: vi.fn(() => false), speaking: false, canReplay: true }));
vi.mock("@/features/call/hooks/useSpeaker", () => ({ useSpeaker: () => speaker }));

let pause: () => void = () => {};
const phrase = (heard = true, speechMs = heard ? 1500 : 0) => ({ audio: new Blob(["x"]), heard, speechMs });

function fakeCall() {
  return {
    ref: { current: { phase: "active", mode: "ai", sending: false } },
    ask: vi.fn(async () => reply()), notice: vi.fn(), showError: vi.fn(), start: vi.fn(async () => reply()),
  } as unknown as CallSession & { ask: ReturnType<typeof vi.fn>; notice: ReturnType<typeof vi.fn> };
}

const hint = (k: keyof typeof TEXTS.hints) => TEXTS.hints[k]; // подсказки — из мок-ответа /api/texts

beforeEach(() => {
  vi.clearAllMocks();
  resetTextsForTests(TEXTS);
  mic.open.mockImplementation(async (cb: () => void) => { pause = cb; return null; });
});

describe("голосовой цикл: подсказки и шум", () => {
  it("тексты с сервера не загрузились — подсказку не показываем, слушаем как обычно", async () => {
    resetTextsForTests(null);
    const call = fakeCall();
    speech.recognize.mockResolvedValue({ text: "", confidence: null });
    mic.take.mockResolvedValue(phrase());
    const { result } = renderHook(() => useVoiceTurns(call));
    await act(async () => { result.current.press(); });
    await act(async () => { pause(); });
    await act(async () => { pause(); }); // второй промах — подсказка была бы, но текста нет
    expect(call.notice).not.toHaveBeenCalled();
    expect(mic.open).toHaveBeenCalledTimes(3);
  });
  it("тихий пациент думает: шум в паузах не выключает голосовой ввод и не даёт подсказок", async () => {
    const call = fakeCall();
    speech.recognize.mockResolvedValue({ text: "", confidence: null });
    mic.take.mockResolvedValue(phrase(true, 900));
    const { result } = renderHook(() => useVoiceTurns(call));
    await act(async () => { result.current.press(); });
    for (let i = 0; i < MAX_NOISE_TURNS - 1; i++) await act(async () => { pause(); });
    expect(call.notice).not.toHaveBeenCalled();
    expect(mic.open).toHaveBeenCalledTimes(MAX_NOISE_TURNS); // всё время слушаем
    await act(async () => { pause(); }); // одним шумом слишком долго — пациент, видимо, отошёл
    expect(call.notice.mock.calls.map(([t]) => t)).toEqual([hint(NOT_HEARD)]);
  });
});
