// Разговор со Здравушкой: POST /api/chat {session_id, text} → ChatResponse.
// Начало звонка — пустой текст без session_id; дальше session_id из ответа.

import type { ChatResponse } from "../types/chat";
import { request } from "./http";

/** Поля могут прийти пустыми — нормализуем, чтобы экран не падал */
function normalize(d: Partial<ChatResponse>): ChatResponse {
  return {
    session_id: d.session_id ?? "",
    reply: d.reply ?? "",
    intent: d.intent ?? null,
    collected: d.collected ?? {},
    options: Array.isArray(d.options) ? d.options : [],
    booking: d.booking ?? null,
    escalation: d.escalation ?? null,
    done: Boolean(d.done),
    status: d.status ?? null,
    source: d.source ?? null,
  };
}

export async function sendChat(sessionId: string | null, text: string): Promise<ChatResponse> {
  const d = await request<Partial<ChatResponse>>("POST", "/api/chat", "экран пациента", { session_id: sessionId, text });
  return normalize(d);
}
