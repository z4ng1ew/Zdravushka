// Запись с микрофона с автоостановкой по паузе. Микрофон работает только на https:// или http://localhost.

export interface Recording {
  stop: () => Promise<Blob>; // закончить и получить звук
  cancel: () => void; // выбросить запись
  heardSpeech: () => boolean; // был ли голос (а не только тишина)
}

/** Почему микрофон недоступен — для понятной подсказки пациенту */
export type MicProblem = "insecure" | "unsupported" | "denied";

export class MicError extends Error {
  constructor(public problem: MicProblem, message: string) { super(message); }
}

/** Доступен ли микрофон в этом браузере и на этом адресе (без запроса разрешения) */
export function micProblem(): MicProblem | null {
  if (typeof window === "undefined") return "unsupported";
  if (!window.isSecureContext) return "insecure";
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") return "unsupported";
  return null;
}

/** Пауза в речи: громкость ниже порога после того, как человек начал говорить */
function silenceDetector(stream: MediaStream, threshold: number) {
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  ctx.createMediaStreamSource(stream).connect(analyser);
  const buf = new Float32Array(analyser.fftSize);
  const loud = () => {
    analyser.getFloatTimeDomainData(buf);
    let sum = 0;
    for (const v of buf) sum += v * v;
    return Math.sqrt(sum / buf.length) > threshold;
  };
  return { loud, close: () => { ctx.close().catch(() => {}); } };
}

/**
 * Начать запись. Сама остановится (onAutoStop), когда человек замолчит после фразы
 * или пройдёт maxMs. Если что-то пошло не так после включения микрофона — выключаем его.
 */
export async function startRecording(
  onAutoStop: () => void,
  { silenceMs = 1300, maxMs = 15000, threshold = 0.025 } = {},
): Promise<Recording> {
  const problem = micProblem();
  if (problem) throw new MicError(problem, problem === "insecure" ? "страница открыта не по https" : "браузер не умеет записывать звук");
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
  } catch (e) {
    throw new MicError("denied", e instanceof Error ? e.message : String(e));
  }
  try {
    return record(stream, onAutoStop, silenceMs, maxMs, threshold);
  } catch (e) {
    stream.getTracks().forEach((t) => t.stop()); // не оставляем микрофон включённым
    throw new MicError("unsupported", e instanceof Error ? e.message : String(e));
  }
}

function record(stream: MediaStream, onAutoStop: () => void, silenceMs: number, maxMs: number, threshold: number): Recording {
  const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"]
    .find((m) => MediaRecorder.isTypeSupported(m));
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunks: BlobPart[] = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const detector = silenceDetector(stream, threshold);
  try {
    rec.start(250);
  } catch (e) {
    detector.close();
    throw e;
  }
  let spoke = false;
  let fired = false;
  const started = performance.now();
  let quietSince = started;
  const tick = setInterval(() => {
    const now = performance.now();
    if (detector.loud()) { spoke = true; quietSince = now; }
    if (!fired && ((spoke && now - quietSince > silenceMs) || now - started > maxMs)) { fired = true; onAutoStop(); }
  }, 100);
  const cleanup = () => { clearInterval(tick); stream.getTracks().forEach((t) => t.stop()); detector.close(); };
  return {
    stop: () => new Promise<Blob>((resolve) => {
      rec.onstop = () => { cleanup(); resolve(new Blob(chunks, { type: rec.mimeType || "audio/webm" })); };
      if (rec.state !== "inactive") rec.stop(); else { cleanup(); resolve(new Blob(chunks)); }
    }),
    cancel: () => { if (rec.state !== "inactive") rec.stop(); cleanup(); },
    heardSpeech: () => spoke,
  };
}
