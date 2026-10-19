// Разговор со Здравушкой: POST /api/chat {session_id, text} → ChatResponse.
// Начало звонка — пустой текст без session_id; дальше session_id из ответа.
// Форма ответа проверяется (parseChat): пустые поля — значения по умолчанию, не объект — ошибка 502.

import type { ChatResponse } from "../types/chat";
import { request } from "./http";
import { parseChat } from "./parseChat";

export const sendChat = (sessionId: string | null, text: string): Promise<ChatResponse> =>
  request("POST", "/api/chat", "экран пациента", { body: { session_id: sessionId, text }, parse: parseChat });
