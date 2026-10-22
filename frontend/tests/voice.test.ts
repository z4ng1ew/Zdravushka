// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CallSession } from "@/features/call/hooks/useCallSession";
import { useVoiceTurns } from "@/features/call/hooks/useVoiceTurns";
import { ECHO_TAIL_MS, GIVE_UP, MIC_TEXT, NOT_HEARD, SAID_SOMETHING_MS, SAY_AGAIN } from "@/features/call/model/speechMisses";
import { resetTextsForTests } from "@/shared/store/uiTexts";
import { reply, TEXTS } from "./fixtures";

const mic = vi.hoisted(() => ({ open: vi.fn(), take: vi.fn(), cancel: vi.fn(), release: vi.fn(), listening: false }));
vi.mock("@/features/call/hooks/useMicrophone", () => ({ useMicrophone: () => mic }));
const speech = vi.hoisted(() => ({ recognize: vi.fn(), synthesize: vi.fn() }));
vi.mock("@/shared/api/speech", () => speech);
const speaker = vi.hoisted(() => ({ speak: vi.fn(async () => {}), silence: vi.fn(), busy: vi.fn(() => false), speaking: false, canReplay: true }));
vi.mock("@/features/call/hooks/useSpeaker", () => ({ useSpeaker: () => speaker }));

let pause: () => void = () => {};
const phrase = (heard = true, speechMs = heard ? 1500 : 0) => ({ audio: new Blob(["x"]), heard, speechMs });
const echoTail = () => new Promise((ok) => setTimeout(ok, ECHO_TAIL_MS + 50));

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
  it("промахи распознавания: 1-й — молча, 2-й — «Не расслышал», 3-й — микрофон больше не крутится по кругу", async () => {
    const call = fakeCall();
    speech.recognize.mockResolvedValue({ text: "", confidence: null });
    mic.take.mockResolvedValue(phrase());
    const { result } = renderHook(() => useVoiceTurns(call));
    await act(async () => { result.current.press(); });
    await act(async () => { pause(); });
    expect(call.notice).not.toHaveBeenCalled(); // первый промах — без подсказки
    await act(async () => { pause(); });
    await act(async () => { pause(); });
    expect(call.notice.mock.calls.map(([t]) => t)).toEqual([hint(SAY_AGAIN), hint(GIVE_UP)]);
    expect(mic.open).toHaveBeenCalledTimes(3);
  });
  it("полминуты тишины — микрофон выключается с подсказкой, без отправки на распознавание", async () => {
    const call = fakeCall();
    mic.take.mockResolvedValue(phrase(false));
    const { result } = renderHook(() => useVoiceTurns(call));
    await act(async () => { result.current.press(); });
    await act(async () => { pause(); });
    await act(async () => { pause(); });
    expect(call.notice.mock.calls.map(([t]) => t)).toEqual([hint(NOT_HEARD)]);
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
    expect(mic.open).toHaveBeenCalledTimes(1); // сразу после озвучки микрофон ещё закрыт — ждём, пока стихнет эхо
    await act(echoTail);
    expect(mic.open).toHaveBeenCalledTimes(2);
  });
  it("перед озвучкой микрофон выключается — ассистент не записывает сам себя", async () => {
    const call = fakeCall();
    speech.recognize.mockResolvedValue({ text: "да", confidence: 0.9 });
    mic.take.mockResolvedValue(phrase());
    const order: string[] = [];
    mic.cancel.mockImplementation(() => order.push("mic off"));
    speaker.speak.mockImplementation(async () => { order.push("speak"); });
    const { result } = renderHook(() => useVoiceTurns(call));
    await act(async () => { result.current.press(); });
    await act(async () => { pause(); });
    expect(order.slice(0, 2)).toEqual(["mic off", "speak"]);
    speaker.speak.mockImplementation(async () => {});
    await act(echoTail); // дождаться повторного включения, чтобы таймер не перешёл в следующий тест
  });
  it("пока идёт озвучка, микрофон не открывается и кнопка не срабатывает", async () => {
    const call = fakeCall();
    speaker.busy.mockReturnValue(true);
    const { result } = renderHook(() => useVoiceTurns(call));
    await act(async () => { result.current.press(); });
    expect(mic.open).not.toHaveBeenCalled();
    speaker.busy.mockReturnValue(false);
  });
  it("«Повторить» в голосовом звонке: микрофон выключен на время озвучки, потом снова слушаем", async () => {
    const call = fakeCall();
    const { result } = renderHook(() => useVoiceTurns(call));
    await act(async () => { result.current.press(); }); // голосовой звонок, слушаем
    mic.open.mockClear();
    let done!: Promise<void>;
    await act(async () => { done = result.current.speak("Повторяю"); });
    expect(speaker.speak).toHaveBeenCalledWith("Повторяю");
    expect(mic.cancel).toHaveBeenCalled();
    expect(mic.open).not.toHaveBeenCalled();
    await act(async () => { await done; });
    expect(mic.open).toHaveBeenCalledTimes(1);
  });
  it("пусто от распознавания после шума короче 1,2 с (вентилятор, эхо) — без «Не расслышал»", async () => {
    const call = fakeCall();
    speech.recognize.mockResolvedValue({ text: "", confidence: null });
    mic.take.mockResolvedValue(phrase(true, SAID_SOMETHING_MS - 100));
    const { result } = renderHook(() => useVoiceTurns(call));
    await act(async () => { result.current.press(); });
    await act(async () => { pause(); });
    expect(call.notice).not.toHaveBeenCalledWith(hint(SAY_AGAIN));
    expect(mic.open).toHaveBeenCalledTimes(2); // слушаем дальше
  });
});
