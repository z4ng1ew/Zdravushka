"use client";

// Микрофон для голосового звонка: открыть запись, забрать фразу, выбросить запись.
// Микрофон недоступен — пишем в журнал ошибок и возвращаем причину (подсказку покажет звонок).

import { useCallback, useRef, useState } from "react";
import { ApiError } from "@/shared/api/ApiError";
import { logError } from "@/shared/api/errorLog";
import { MicError, startRecording, type MicProblem, type Recording } from "@/shared/browser/recorder";

export interface Phrase { audio: Blob; heard: boolean; speechMs: number } // heard — был голос, а не только тишина

export function useMicrophone() {
  const [listening, setListening] = useState(false);
  const rec = useRef<Recording | null>(null);

  /** Начать слушать; onPause — пациент замолчал. null — слушаем, иначе причина, почему нельзя */
  const open = useCallback(async (onPause: () => void): Promise<MicProblem | null> => {
    if (rec.current) return null;
    try {
      rec.current = await startRecording(onPause);
      setListening(true);
      return null;
    } catch (err) {
      const problem = err instanceof MicError ? err.problem : "denied";
      const why = err instanceof Error ? err.message : String(err);
      logError(new ApiError(null, "MIC", "микрофон", `Микрофон недоступен (${problem}): ${why}`), "голос");
      return problem;
    }
  }, []);

  /** Остановить запись и забрать фразу (null — запись не шла) */
  const take = useCallback(async (): Promise<Phrase | null> => {
    const r = rec.current;
    if (!r) return null;
    rec.current = null;
    setListening(false);
    const heard = r.heardSpeech();
    const speechMs = r.speechMs();
    return { audio: await r.stop(), heard, speechMs };
  }, []);

  const cancel = useCallback(() => { rec.current?.cancel(); rec.current = null; setListening(false); }, []);

  return { listening, open, take, cancel };
}
