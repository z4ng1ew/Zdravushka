// Состояние звонка пациента и его изменения (чистый reducer — без сети, таймеров и браузера).

import type { ApiError } from "@/shared/api/ApiError";
import { nowHM } from "@/shared/domain/dates";
import type { ReplyTag } from "@/shared/domain/replyTags";
import type { ChatBooking, ChatEscalation, ChatResponse, UiBooking } from "@/shared/types/chat";
import type { CallMode, CallPhase, LiveLine } from "@/shared/types/live";
import type { Ticket } from "@/shared/types/ticket";
import type { FeedItem } from "./feed";

export interface CallState {
  callNo: number; // номер звонка на этой странице — для сброса таймера
  phase: CallPhase;
  mode: CallMode;
  operator: string | null;
  sending: boolean;
  feed: FeedItem[];
  intent: string | null;
  fields: Record<string, string>; // что понял Здравушка (collected)
  options: ChatBooking[];
  booking: UiBooking | null;
  escalation: ChatEscalation | null;
  ticket: Ticket | null; // талон, выданный в этом звонке
}

export type CallAction =
  | { type: "reset" }
  | { type: "phase"; phase: CallPhase }
  | { type: "mode"; mode: CallMode; operator?: string | null }
  | { type: "sending"; value: boolean }
  | { type: "line"; line: Omit<LiveLine, "at"> }
  | { type: "notice"; text: string }
  | { type: "error"; error: ApiError }
  | { type: "clearOptions" }
  | { type: "reply"; r: ChatResponse; tags: ReplyTag[]; booking: UiBooking | null; ticket: Ticket | null };

export const initialCall: CallState = {
  callNo: 0, phase: "idle", mode: "ai", operator: null, sending: false, feed: [],
  intent: null, fields: {}, options: [], booking: null, escalation: null, ticket: null,
};

const add = (s: CallState, item: FeedItem): CallState => ({ ...s, feed: [...s.feed, item] });

function applyReply(s: CallState, a: Extract<CallAction, { type: "reply" }>): CallState {
  const { r } = a;
  let next: CallState = { ...s, intent: r.intent ?? s.intent, fields: r.collected, options: r.options };
  if (r.reply) next = add(next, { type: "line", line: { speaker: "bot", text: r.reply, at: nowHM(), tags: a.tags } });
  if (a.booking) next = { ...next, booking: a.booking };
  if (a.ticket) next = add({ ...next, ticket: a.ticket }, { type: "ticket", ticket: a.ticket, at: nowHM() });
  // бот передаёт пациента человеку — звонок не обрываем, ждём регистратора
  if (r.escalation) return { ...next, escalation: r.escalation, mode: "waiting" };
  return r.done ? { ...next, phase: "ended" } : next;
}

export function callReducer(s: CallState, a: CallAction): CallState {
  switch (a.type) {
    case "reset": return { ...initialCall, callNo: s.callNo + 1, phase: "active" };
    case "phase": return { ...s, phase: a.phase };
    case "mode": return { ...s, mode: a.mode, operator: a.operator === undefined ? s.operator : a.operator };
    case "sending": return { ...s, sending: a.value };
    case "line": return add(s, { type: "line", line: { ...a.line, at: nowHM() } });
    case "notice": return add(s, { type: "notice", text: a.text, at: nowHM() });
    case "error": return add(s, { type: "error", status: a.error.status, detail: a.error.message, at: nowHM() });
    case "clearOptions": return { ...s, options: [] };
    case "reply": return applyReply(s, a);
  }
}
