// Разбор ответов разговора: /api/chat, /api/health, /api/asr (формат — app/models.py бэкенда).

import type { ChatBooking, ChatEscalation, ChatResponse, Health } from "../types/chat";
import { isObj, numOrNull, obj, softList, str, strOrNull, textRecord } from "./parse";
import { parseLastAi } from "./providers";

export function parseBooking(v: unknown): ChatBooking | null {
  if (!isObj(v)) return null;
  return {
    visit_id: numOrNull(v.visit_id), doctor_id: numOrNull(v.doctor_id),
    doctor_name: strOrNull(v.doctor_name), specialty: strOrNull(v.specialty),
    scheduled_at: strOrNull(v.scheduled_at), spoken: strOrNull(v.spoken), status: strOrNull(v.status),
  };
}

function parseEscalation(v: unknown): ChatEscalation | null {
  if (!isObj(v)) return null;
  return {
    rule: str(v.rule), reason: str(v.reason), priority: str(v.priority),
    emergency: v.emergency === true, summary: str(v.summary),
  };
}

/** Пауза до конца фразы от сервера: разумное число мс (0,3…10 с), иначе поля нет — фронт возьмёт своё */
function listenMs(v: unknown): { listen_ms?: number } {
  const n = typeof v === "number" ? v : Number.NaN;
  return Number.isFinite(n) && n >= 300 && n <= 10_000 ? { listen_ms: Math.round(n) } : {};
}

/** Ответ /api/chat: без объекта — ошибка формата; пустые поля — значения по умолчанию */
export function parseChat(raw: unknown): ChatResponse {
  const d = obj(raw, "ответ /api/chat");
  return {
    session_id: str(d.session_id),
    reply: str(d.reply),
    intent: strOrNull(d.intent),
    collected: textRecord(d.collected),
    options: softList(d.options, parseBooking),
    booking: parseBooking(d.booking),
    escalation: parseEscalation(d.escalation),
    done: d.done === true,
    status: strOrNull(d.status),
    source: strOrNull(d.source),
    explanation: strOrNull(d.explanation),
    understood_by: strOrNull(d.understood_by),
    asr_confidence: toConfidence(d.asr_confidence),
    label: typeof d.label === "string" && d.label.trim() ? d.label.trim() : null,
    ...listenMs(d.listen_ms),
  };
}

export function parseHealth(raw: unknown): Health {
  const d = obj(raw, "ответ /api/health");
  return {
    status: str(d.status),
    assistant: str(d.assistant) || undefined,
    mode: str(d.mode) || undefined,
    llm: typeof d.llm === "boolean" ? d.llm : undefined,
    stt: typeof d.stt === "boolean" ? d.stt : undefined,
    tts: typeof d.tts === "string" || typeof d.tts === "boolean" ? d.tts : null,
    telephony: strOrNull(d.telephony),
    pd_trusted_ai_only: typeof d.pd_trusted_ai_only === "boolean" ? d.pd_trusted_ai_only : undefined,
    last_ai: parseLastAi(d.last_ai),
  };
}

/** Уверенность распознавания 0…1; сервер мог прислать проценты (92) — переводим; мусор → null */
export function toConfidence(v: unknown): number | null {
  const n = numOrNull(v);
  if (n === null || n < 0) return null;
  const share = n > 1 ? n / 100 : n;
  return share > 1 ? null : share;
}

export interface AsrResult { text: string; confidence: number | null }

export function parseAsr(raw: unknown): AsrResult {
  const d = obj(raw, "ответ /api/asr");
  return { text: str(d.text).trim(), confidence: toConfidence(d.confidence) };
}
