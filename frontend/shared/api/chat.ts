// Разговор с ассистентом: POST /api/chat {session_id, text, asr_confidence?} → ChatResponse.
// asr_confidence — точность распознавания фразы из /api/asr (0…1): при плохом распознавании бот переспросит.
// Фраза, набранная текстом, уходит без asr_confidence.
// Начало звонка — пустой текст без session_id; дальше session_id из ответа.
// Форма ответа проверяется (parseChat): пустые поля — значения по умолчанию, не объект — ошибка 502.

import type { ChatResponse } from "../types/chat";
import { request } from "./http";
import { parseChat } from "./parseChat";

export const sendChat = (sessionId: string | null, text: string, asrConfidence?: number | null): Promise<ChatResponse> => {
  const heard = typeof asrConfidence === "number" && Number.isFinite(asrConfidence) ? { asr_confidence: asrConfidence } : {};
  return request("POST", "/api/chat", "экран пациента", { body: { session_id: sessionId, text, ...heard }, parse: parseChat });
};
