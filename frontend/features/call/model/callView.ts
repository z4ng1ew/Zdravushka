// Что показать по состоянию звонка (чистые функции): статус под микрофоном, плашка «кто ведёт»,
// метка «Запись на приём», можно ли звонить или говорить.

import type { CallState } from "./callState";
import { feedLines } from "./feed";

export interface VoiceFlags { listening: boolean; transcribing: boolean; speaking: boolean }

export const canCall = (s: CallState) => s.phase !== "active" && !s.sending;

export const canTalk = (s: CallState, v: VoiceFlags) =>
  s.phase === "active" && s.mode === "ai" && !s.sending && !v.transcribing && !v.speaking;

/** Подпись под микрофоном: что сейчас происходит в звонке */
export function statusText(s: CallState, v: VoiceFlags): string {
  if (s.phase === "idle") return "Здравушка готов помочь";
  if (s.phase === "ended") return "Звонок завершён";
  const last = feedLines(s.feed).at(-1);
  if (s.mode === "waiting") return "Соединяю с регистратором…";
  if (s.mode === "operator") return last?.speaker === "operator" ? "Говорит регистратор…" : "Регистратор слушает вас…";
  return aiStatus(s, v, last?.speaker);
}

function aiStatus(s: CallState, v: VoiceFlags, lastSpeaker?: string): string {
  if (v.listening) return "Слушаю — говорите";
  if (v.transcribing) return "Распознаю речь…";
  if (s.sending) return "Здравушка думает…";
  return v.speaking || !lastSpeaker || lastSpeaker === "bot" ? "Здравушка говорит…" : "Слушаю вас…";
}

export function pillView(s: CallState): { cls: string; text: string } {
  if (s.phase !== "active") return { cls: "pill-ghost", text: s.phase === "ended" ? "Звонок завершён" : "Нет звонка" };
  if (s.mode === "operator") return { cls: "pill-green", text: `На линии регистратор${s.operator ? " " + s.operator : ""}` };
  if (s.mode === "waiting") return { cls: "pill-orange", text: "Ожидание регистратора" };
  return { cls: "pill-blue", text: "Ведёт ИИ" };
}

export function recordTag(s: CallState): { cls: string; text: string } {
  const { options, escalation, ticket, booking, mode } = s;
  if (options.length) return { cls: "tag-info", text: `Варианты: ${options.length}` };
  if (escalation) return escalation.emergency ? { cls: "tag-bad", text: "Срочно: 103 / 112" } : { cls: "tag-warn", text: "Передано регистратору" };
  if (ticket?.status === "Запланирована") return { cls: "tag-ok", text: `Талон к записи № ${ticket.visitId}` };
  if (booking) return { cls: booking.kind === "booked" ? "tag-ok" : booking.kind === "cancelled" ? "" : "tag-warn", text: booking.title };
  if (mode !== "ai") return { cls: "tag-warn", text: mode === "operator" ? "Ведёт регистратор" : "Передано регистратору" };
  return { cls: "", text: "Пусто" };
}
