// Подпись под ответом ассистента — готовый текст с сервера (поле label ответа /api/chat):
//   «✓ Записано в МИС · № записи 837», «📄 Ответ по регламенту», «👤 Передано регистратору · R-07»,
//   «🚑 Срочно: 103 · R-01», «✓ Данные из МИС» или null — без подписи.
// Фронт подписи не сочиняет и статус не угадывает — выбирает только цвет по status
// (completed → ok/info, handoff → warn, угроза жизни и error → bad).

import type { ChatResponse } from "../types/chat";

export type TagTone = "ok" | "info" | "warn" | "bad" | "muted";
export interface ReplyTag { text: string; tone: TagTone; tip?: string }

const isRule = (src: string) => /регламент|regulation|rules/i.test(src);

/** Цвет подписи по status ответа */
export function labelTone(r: ChatResponse): TagTone {
  const st = (r.status ?? "").trim().toLowerCase();
  if (st === "error" || r.escalation?.emergency) return "bad";
  if (st === "handoff") return "warn";
  if (st === "completed") return isRule(r.source ?? "") ? "info" : "ok";
  return "muted";
}

export function replyTags(r: ChatResponse): ReplyTag[] {
  const text = (r.label ?? "").trim();
  return text ? [{ text, tone: labelTone(r) }] : [];
}

/** Кто понял фразу пациента: llm → нейросетью, rules → по правилам; незнакомое — как прислал сервер */
export function understoodText(by: string | null | undefined): string {
  const v = (by ?? "").trim();
  if (!v) return "";
  if (/llm|neur|ai|gpt|giga|нейро|ии/i.test(v)) return "понято нейросетью";
  if (/rule|regex|правил/i.test(v)) return "понято по правилам";
  return `понято: ${v}`;
}

/** Пояснение для пациента — только понятный текст от сервера (explanation) */
export const replyExplain = (r: ChatResponse): string => (r.explanation ?? "").trim();

/** Служебная строка для регистратора: кем понята фраза · точность распознавания.
 *  Пациенту не показываем. Точность — из ответа (asr_confidence), иначе та, что фронт отправил из /api/asr. */
export function replyTech(r: ChatResponse, sentConfidence?: number): string {
  const conf = r.asr_confidence ?? (typeof sentConfidence === "number" && Number.isFinite(sentConfidence) ? sentConfidence : null);
  const pct = conf === null ? "" : `распознано на ${Math.round(Math.min(1, Math.max(0, conf)) * 100)} %`;
  return [understoodText(r.understood_by), pct].filter(Boolean).join(" · ");
}
