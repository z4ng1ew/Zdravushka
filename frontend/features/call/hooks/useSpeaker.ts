"use client";

// Озвучка ответов Здравушки (/api/tts). Если озвучки на сервере нет (404/405/501) — больше не пробуем;
// временный сбой (502 и т. п.) — просто отвечаем без звука. silence() — замолчать сразу
// (пациент завершил звонок, начал заново, вмешался регистратор).

import { useCallback, useRef, useState } from "react";
import { toApiError } from "@/shared/api/ApiError";
import { synthesize } from "@/shared/api/speech";
import { play } from "@/shared/browser/player";

const TTS_ABSENT = [404, 405, 501];

export function useSpeaker() {
  const [speaking, setSpeaking] = useState(false);
  const available = useRef<boolean | null>(null); // null — ещё не пробовали
  const [absent, setAbsent] = useState(false); // озвучки нет — кнопка «Повторить» не нужна
  const current = useRef<AbortController | null>(null);

  const silence = useCallback(() => {
    current.current?.abort();
    current.current = null;
    setSpeaking(false);
  }, []);

  const speak = useCallback(async (text: string) => {
    if (!text || available.current === false) return;
    silence(); // две фразы одновременно не звучат
    const ctrl = new AbortController();
    current.current = ctrl;
    try {
      const audio = await synthesize(text);
      available.current = true;
      if (ctrl.signal.aborted) return;
      setSpeaking(true);
      await play(audio, ctrl.signal);
    } catch (e) {
      const st = toApiError(e).status;
      if (st !== null && TTS_ABSENT.includes(st)) { available.current = false; setAbsent(true); }
    } finally {
      if (current.current === ctrl) { current.current = null; setSpeaking(false); }
    }
  }, [silence]);

  return { speak, silence, speaking, canReplay: !absent && !speaking };
}
