// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SPEECH_MIN_MS, startRecording, WARMUP_MS } from "@/shared/browser/recorder";

// Громкость микрофона по шагам по 100 мс: тест задаёт, что «слышно» в каждый момент
let level = 0;
let constraints: unknown = null;

class FakeAnalyser {
  fftSize = 4;
  getFloatTimeDomainData(buf: Float32Array) { buf.fill(level); }
}
class FakeCtx {
  createAnalyser() { return new FakeAnalyser(); }
  createMediaStreamSource() { return { connect: () => {} }; }
  close() { return Promise.resolve(); }
}
class FakeRecorder {
  static isTypeSupported = () => true;
  state = "inactive"; mimeType = "audio/webm";
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  start() { this.state = "recording"; }
  stop() { this.state = "inactive"; this.onstop?.(); }
}

beforeEach(() => {
  vi.useFakeTimers();
  level = 0;
  Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
  vi.stubGlobal("AudioContext", FakeCtx);
  vi.stubGlobal("MediaRecorder", FakeRecorder);
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: async (c: unknown) => { constraints = c; return { getTracks: () => [{ stop: () => {} }] }; } },
  });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("запись с микрофона: что считать речью", () => {
  it("микрофон просим с подавлением эха и шума", async () => {
    await startRecording(() => {});
    expect(constraints).toMatchObject({ audio: { echoCancellation: true, noiseSuppression: true } });
  });
  it("громко в первые доли секунды (щелчок, хвост озвучки) — не речь", async () => {
    level = 0.3;
    const r = await startRecording(() => {});
    await vi.advanceTimersByTimeAsync(WARMUP_MS - 50);
    level = 0;
    await vi.advanceTimersByTimeAsync(1000);
    expect(r.heardSpeech()).toBe(false);
  });
  it("короткий всплеск после начала — не речь; голос дольше порога — речь", async () => {
    const r = await startRecording(() => {});
    await vi.advanceTimersByTimeAsync(WARMUP_MS + 100);
    level = 0.3; await vi.advanceTimersByTimeAsync(SPEECH_MIN_MS - 100);
    level = 0; await vi.advanceTimersByTimeAsync(300);
    expect(r.heardSpeech()).toBe(false);
    level = 0.3; await vi.advanceTimersByTimeAsync(1000);
    expect(r.heardSpeech()).toBe(true);
    expect(r.speechMs()).toBeGreaterThanOrEqual(900);
  });
  it("после фразы замолчал — запись останавливается сама", async () => {
    const stop = vi.fn();
    await startRecording(stop, { silenceMs: 800 });
    await vi.advanceTimersByTimeAsync(WARMUP_MS + 100);
    level = 0.3; await vi.advanceTimersByTimeAsync(800);
    level = 0; await vi.advanceTimersByTimeAsync(1000);
    expect(stop).toHaveBeenCalledTimes(1);
  });
});
