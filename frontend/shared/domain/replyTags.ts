// Бейдж под ответом Здравушки из status/source ответа /api/chat (app/dialog/common.py бэкенда):
//   status: in_progress | completed | handoff | error;  source: «МИС» | «регламент РГ-ТЕЛ-01» | null.
// in_progress — без бейджа. Неизвестные значения показываем как прислал сервер.

import type { ChatResponse } from "../types/chat";
import type { MisMode } from "./misMode";

export type TagTone = "ok" | "info" | "warn" | "bad" | "muted";
export interface ReplyTag { text: string; tone: TagTone; tip?: string }

/** Что сделано в МИС — по намерению */
const DONE_IN_MIS: Record<string, string> = {
  booking: "Записано в МИС", reschedule: "Перенесено в МИС", cancel: "Отменено в МИС",
  status: "Данные из МИС", schedule_info: "Данные из МИС", reminder: "Отмечено в МИС",
};

const isMis = (src: string) => /^мис|^mis|^stand/i.test(src);
const isRule = (src: string) => /регламент|regulation|rules/i.test(src);

/** Статус хода: из ответа, а для старого бэкенда без поля status — по структуре ответа */
function stepStatus(r: ChatResponse): string {
  const st = (r.status ?? "").trim().toLowerCase();
  if (st) return st;
  return r.escalation ? "handoff" : r.done || r.booking?.status ? "completed" : "in_progress";
}

function handoffTag(r: ChatResponse): ReplyTag {
  const rule = r.escalation?.rule ? ` · ${r.escalation.rule}` : "";
  return r.escalation?.emergency
    ? { text: `🚑 Срочно: 103${rule}`, tone: "bad", tip: "Угроза жизни — звоните 103 или 112. Обращение передано регистратору." }
    : { text: `👤 Передано регистратору${rule}`, tone: "warn", tip: r.escalation?.reason };
}

/** Действие подтверждено МИС: что сделано и номер записи */
function misTag(r: ChatResponse, mode: MisMode): ReplyTag {
  const cancelled = r.booking?.status === "Отменена";
  const what = cancelled ? "Отменено в МИС" : DONE_IN_MIS[r.intent ?? ""] ?? "Выполнено в МИС";
  const no = r.booking?.visit_id ? ` · № записи ${r.booking.visit_id}` : "";
  const mock = mode === "mock" ? " Сейчас работает имитация МИС (отладка)." : "";
  return { text: `✓ ${what}${no}`, tone: "ok", tip: `Действие подтверждено ответом МИС.${mock}` };
}

function completedTag(r: ChatResponse, mode: MisMode): ReplyTag | null {
  const src = (r.source ?? "").trim();
  if (isRule(src)) return { text: "📄 Ответ по регламенту", tone: "info", tip: src };
  if (isMis(src) || (!src && r.booking?.status)) return misTag(r, mode);
  return src ? { text: src, tone: "muted" } : null;
}

export function replyTags(r: ChatResponse, mode: MisMode): ReplyTag[] {
  const status = stepStatus(r);
  if (status === "in_progress") return [];
  if (status === "error") return [{ text: "⚠ Сбой, соединяем с регистратором", tone: "bad" }];
  if (status === "handoff") return [handoffTag(r)];
  if (status === "completed") return [completedTag(r, mode)].filter((t): t is ReplyTag => t !== null);
  return [{ text: r.status!.trim(), tone: "muted" }];
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
