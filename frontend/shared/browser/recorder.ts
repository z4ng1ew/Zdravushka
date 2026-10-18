// Запись с микрофона с автоостановкой по паузе. Микрофон работает только на https:// или http://localhost.

export interface Recording {
  stop: () => Promise<Blob>; // закончить и получить звук
  cancel: () => void; // выбросить запись
  heardSpeech: () => boolean; // был ли голос (а не только тишина)
}

/**
 * Начать запись. Сама остановится (onAutoStop), когда человек замолчит после фразы
 * или пройдёт maxMs. Тишину определяем по громкости сигнала.
 */
export async function startRecording(
  onAutoStop: () => void,
  { silenceMs = 1300, maxMs = 15000, threshold = 0.025 } = {},
): Promise<Recording> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
  });
  const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"]
    .find((m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m));
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunks: BlobPart[] = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };

  // простой детектор паузы
  const ctx = new AudioContext();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  ctx.createMediaStreamSource(stream).connect(analyser);
  const buf = new Float32Array(analyser.fftSize);
  let spoke = false;
  let quietSince = performance.now();
  const started = performance.now();
  let fired = false;
  const tick = setInterval(() => {
    analyser.getFloatTimeDomainData(buf);
    let sum = 0;
    for (const v of buf) sum += v * v;
    const rms = Math.sqrt(sum / buf.length);
    const now = performance.now();
    if (rms > threshold) { spoke = true; quietSince = now; }
    const silentLongEnough = spoke && now - quietSince > silenceMs;
    if (!fired && (silentLongEnough || now - started > maxMs)) { fired = true; onAutoStop(); }
  }, 100);

  const cleanup = () => {
    clearInterval(tick);
    stream.getTracks().forEach((t) => t.stop());
    ctx.close().catch(() => {});
  };

  rec.start(250);
  return {
    stop: () => new Promise<Blob>((resolve) => {
      rec.onstop = () => { cleanup(); resolve(new Blob(chunks, { type: rec.mimeType || "audio/webm" })); };
      if (rec.state !== "inactive") rec.stop(); else { cleanup(); resolve(new Blob(chunks)); }
    }),
    cancel: () => { if (rec.state !== "inactive") rec.stop(); cleanup(); },
    heardSpeech: () => spoke,
  };
}
