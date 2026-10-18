"use client";

// Озвучка ответов Здравушки (/api/tts). Если озвучки на сервере нет (404/405/501) — больше не пробуем;
// временный сбой (502 и т. п.) — просто отвечаем без звука.

import { useCallback, useRef, useState } from "react";
import { toApiError } from "@/shared/api/ApiError";
import { synthesize } from "@/shared/api/speech";
import { play } from "@/shared/browser/player";

const TTS_ABSENT = [404, 405, 501];

export function useSpeaker() {
  const [speaking, setSpeaking] = useState(false);
  const available = useRef<boolean | null>(null); // null — ещё не пробовали

  const speak = useCallback(async (text: string) => {
    if (!text || available.current === false) return;
    try {
      const audio = await synthesize(text);
      available.current = true;
      setSpeaking(true);
      await play(audio);
    } catch (e) {
      const st = toApiError(e).status;
      if (st !== null && TTS_ABSENT.includes(st)) available.current = false;
    } finally {
      setSpeaking(false);
    }
  }, []);

  return { speak, speaking, canReplay: available.current !== false && !speaking };
}
