// Проигрывание звука (ответ ассистента из /api/tts).
// На странице звучит только один ответ: новый сразу останавливает предыдущий — звук не накладывается,
// даже если ответы приходят быстро или пациент нажал «Повторить» во время речи.

const MAX_PLAY_MS = 120_000; // предохранитель: звук без события «закончился» не держит звонок вечно

let stopCurrent: (() => void) | null = null;

/** Остановить то, что звучит сейчас (если звучит) */
export function stopPlayback(): void {
  stopCurrent?.();
}

/** Проиграть звук и дождаться конца. signal — прервать (пациент завершил звонок, вмешался регистратор). */
export function play(audio: Blob, signal?: AbortSignal): Promise<void> {
  stopPlayback();
  return new Promise((resolve) => {
    if (signal?.aborted) { resolve(); return; }
    const url = URL.createObjectURL(audio);
    const a = new Audio(url);
    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      clearTimeout(guard);
      signal?.removeEventListener("abort", stop);
      if (stopCurrent === stop) stopCurrent = null;
      URL.revokeObjectURL(url);
      resolve();
    };
    const stop = () => { a.pause(); done(); };
    const guard = setTimeout(stop, MAX_PLAY_MS);
    stopCurrent = stop;
    signal?.addEventListener("abort", stop);
    a.onended = done;
    a.onerror = done;
    a.play().catch(done); // автозапуск запрещён браузером — просто без звука
  });
}
