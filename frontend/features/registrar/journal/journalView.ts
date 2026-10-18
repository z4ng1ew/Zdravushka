// Журнал звонков: подписи итогов и фильтр.

import type { Call } from "@/shared/types/staff";

export const RESULT_VIEW: Record<string, { text: string; cls: string }> = {
  "записан": { text: "Создана запись", cls: "c-green" },
  "перенесён": { text: "Перенесена запись", cls: "c-blue" },
  "отменён": { text: "Отменена запись", cls: "c-red" },
  "справка": { text: "Справка", cls: "c-blue" },
  "переведён": { text: "Переведён регистратору", cls: "c-orange" },
  "сброшен": { text: "Звонок сброшен", cls: "muted" },
};

export const resultView = (result: string) => RESULT_VIEW[result] ?? { text: result, cls: "" };

/** "bot" — записи, переносы, отмены; "all" — все; иначе — конкретный итог */
export type JournalFilter = string;

const BOT_RESULTS = new Set(["записан", "перенесён", "отменён"]);
const LIMIT = 50;

export function filterJournal(calls: Call[], filter: JournalFilter): Call[] {
  const keep = (c: Call) => filter === "all" || (filter === "bot" ? BOT_RESULTS.has(c.result) : c.result === filter);
  return calls.filter(keep).slice(0, LIMIT);
}
