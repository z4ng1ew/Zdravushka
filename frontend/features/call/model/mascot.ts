// Настроение ассистента над микрофоном — по состоянию звонка (чистая функция, без React).
//   idle — ждёт;  thinking — думает (ждём ответ / распознаём речь);  error — сбой;
//   done — готово (талон выдан);  escalated — передано регистратору.
// Картинки — во фронте, фразы — с сервера (GET /api/texts → mascot[key]).

import type { MascotKey } from "@/shared/types/texts";
import type { CallState } from "./callState";
import type { VoiceFlags } from "./callView";

export type Mood = "idle" | "thinking" | "error" | "done";

export const MOOD_IMG: Record<Mood, string> = {
  idle: "/img/mascot-idle.png",
  thinking: "/img/mascot-thinking.png",
  error: "/img/mascot-error.png",
  done: "/img/mascot-done.png",
};

/** Картинка и ключ фразы. «Передано регистратору» — картинка «важное», своя фраза */
export function mood(s: CallState, v?: Pick<VoiceFlags, "transcribing">): { mood: Mood; key: MascotKey } {
  if (s.sending || v?.transcribing) return { mood: "thinking", key: "thinking" };
  if (s.feed.at(-1)?.type === "error") return { mood: "error", key: "error" };
  if (s.escalation && s.phase === "active") return { mood: "done", key: "escalated" }; // звонок завершён — уже не «передаю»
  if (s.ticket && s.feed.some((f) => f.type === "ticket")) return { mood: "done", key: "done" };
  return { mood: "idle", key: "idle" };
}
