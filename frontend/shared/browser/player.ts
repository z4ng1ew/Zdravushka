// Проигрывание звука (ответ Здравушки из /api/tts).

/** Проиграть звук и дождаться конца. */
export function play(audio: Blob): Promise<void> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(audio);
    const a = new Audio(url);
    const done = () => { URL.revokeObjectURL(url); resolve(); };
    a.onended = done;
    a.onerror = done;
    a.play().catch(done);
  });
}
