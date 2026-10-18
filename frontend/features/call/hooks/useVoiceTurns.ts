"use client";

// Голосовой разговор: микрофон → /api/asr → фраза боту → озвучка ответа (useSpeaker) → снова слушать.
// Ошибки голоса не обрывают звонок: пациенту — понятная подсказка, можно продолжить текстом.

import { useCallback, useRef, useState } from "react";
import { ApiError, toApiError } from "@/shared/api/ApiError";
import { logError } from "@/shared/api/errorLog";
import { recognize } from "@/shared/api/speech";
import { startRecording, type Recording } from "@/shared/browser/recorder";
import type { ChatResponse } from "@/shared/types/chat";
import type { CallSession } from "./useCallSession";
import { useSpeaker } from "./useSpeaker";

const MIC_DENIED = "Нет доступа к микрофону. Разрешите микрофон в браузере или пишите текстом в поле ниже.";
const ASR_FAILED = "Не удалось распознать речь. Скажите ещё раз или напишите текстом.";

export function useVoiceTurns(call: CallSession) {
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const { speak, speaking, canReplay } = useSpeaker();
  const voiceOn = useRef(false); // звонок ведётся голосом (начат с микрофона)
  const rec = useRef<Recording | null>(null);
  const aiTalking = () => call.ref.current.phase === "active" && call.ref.current.mode === "ai";

  const cancel = useCallback(() => { rec.current?.cancel(); rec.current = null; setListening(false); }, []);

  // Шаги голосового цикла ссылаются друг на друга, поэтому объявлены как function (всплытие).
  // Внутри — только ref и стабильные функции, так что старые замыкания безопасны.

  /** После ответа бота в голосовом звонке: озвучить и снова слушать пациента */
  async function afterTurn(r: ChatResponse | null) {
    if (!r || !voiceOn.current) return;
    await speak(r.reply);
    if (!r.done && !r.escalation && aiTalking()) listen();
  }

  /** manual — пациент сам нажал «отправить»: отправляем даже тихую запись */
  async function finish(manual = false) {
    const r = rec.current;
    if (!r) return;
    rec.current = null;
    setListening(false);
    const heard = r.heardSpeech();
    const audio = await r.stop();
    if (!aiTalking()) return;
    if (!heard && !manual) { listen(); return; } // тишина — слушаем дальше
    setTranscribing(true);
    try {
      const res = await recognize(audio);
      if (!res.text) { listen(); return; }
      await afterTurn(await call.ask(res.text, res.text, res.confidence ?? undefined));
    } catch (e) {
      voiceOn.current = false; // не крутим ошибку по кругу — пациент нажмёт микрофон ещё раз
      const st = toApiError(e).status;
      if (st === 502 || st === 503 || st === 408) call.notice(ASR_FAILED); else call.showError(e);
    } finally {
      setTranscribing(false);
    }
  }

  async function listen() {
    if (rec.current) return;
    try {
      rec.current = await startRecording(() => finish(false));
      setListening(true);
    } catch (err) {
      voiceOn.current = false;
      logError(new ApiError(null, "MIC", "микрофон", `Нет доступа к микрофону: ${err instanceof Error ? err.message : err}`), "голос");
      call.notice(MIC_DENIED);
    }
  }

  /** Начать звонок (с первой фразой или без) и вести его голосом, если он начат с микрофона */
  const begin = async (first?: string) => afterTurn(await call.start(first));

  /** Кнопка микрофона: позвонить / начать говорить / отправить фразу */
  const press = () => {
    if (call.ref.current.sending || transcribing || speaking) return;
    if (call.ref.current.phase !== "active") { voiceOn.current = true; begin(); return; }
    if (listening) { finish(true); return; }
    if (call.ref.current.mode === "ai") { voiceOn.current = true; listen(); }
  };

  const stop = () => { cancel(); voiceOn.current = false; };

  return {
    flags: { listening, transcribing, speaking },
    canReplay,
    press, begin, afterTurn, speak, cancel, stop,
  };
}
