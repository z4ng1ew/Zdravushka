// Настроение Здравушки над микрофоном — по состоянию звонка (чистая функция, без React).
//   idle — ждёт;  thinking — думает (ждём ответ / распознаём речь);  error — сбой;  done — готово или важное.

import type { CallState } from "./callState";
import type { VoiceFlags } from "./callView";

export type Mood = "idle" | "thinking" | "error" | "done";

export const MOOD_VIEW: Record<Mood, { img: string; text: string }> = {
  idle: { img: "/img/mascot-idle.png", text: "Привет! Я Здравушка. Чем могу помочь?" },
  thinking: { img: "/img/mascot-thinking.png", text: "Минутку, проверяю…" },
  error: { img: "/img/mascot-error.png", text: "Что-то пошло не так. Попробуйте ещё раз или позовите регистратора." },
  done: { img: "/img/mascot-done.png", text: "Готово! Талон к записи — в чате." },
};

const ESCALATED = "Передаю вас регистратору — он ответит.";
const EMERGENCY = "При угрозе жизни звоните 103 или 112!";

export function mood(s: CallState, v?: Pick<VoiceFlags, "transcribing">): { mood: Mood; text: string } {
  if (s.sending || v?.transcribing) return { mood: "thinking", text: MOOD_VIEW.thinking.text };
  const last = s.feed.at(-1);
  if (last?.type === "error") return { mood: "error", text: MOOD_VIEW.error.text };
  if (s.escalation) return { mood: "done", text: s.escalation.emergency ? EMERGENCY : ESCALATED };
  if (s.ticket && s.feed.some((f) => f.type === "ticket")) {
    const cancelled = s.ticket.status === "Отменена";
    return { mood: "done", text: cancelled ? "Готово! Запись отменена." : MOOD_VIEW.done.text };
  }
  return { mood: "idle", text: MOOD_VIEW.idle.text };
}
