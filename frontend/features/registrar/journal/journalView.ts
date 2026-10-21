// Журнал звонков: подписи итогов и фильтр.

import { newestFirst } from "@/shared/domain/callStats";
import { intentLabel } from "@/shared/domain/intents";
import { norm } from "@/shared/domain/masking";
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

/** Отметки бэкенда у звонка (поле flags) — подписи для регистратора; незнакомые — как прислал сервер */
export function flagLabels(c: Call): string[] {
  return (c.flags ?? []).map((f) => (/inject|инъекц/i.test(f) ? "⚠︎ попытка промпт-инъекции" : `⚠︎ ${f}`));
}

/** "bot" — записи, переносы, отмены; "all" — все; "flagged" — с отметками (промпт-инъекция и т. п.); иначе — конкретный итог */
export type JournalFilter = string;

const BOT_RESULTS = new Set(["записан", "перенесён", "отменён"]);

/** Поиск по журналу: пациент, итог, цель звонка, время */
const matchCall = (c: Call, q: string) =>
  [c.patient ?? "", resultView(c.result).text, intentLabel(c.intent), c.started_at, ...flagLabels(c)].some((v) => norm(v).includes(q));

/** Звонки по фильтру итога и поиску, сначала свежие (страницы — shared/domain/paging.ts) */
export function filterJournal(calls: Call[], filter: JournalFilter, query = ""): Call[] {
  const q = norm(query);
  const byFilter = (c: Call) => filter === "all" || (filter === "flagged" ? (c.flags ?? []).length > 0
    : filter === "bot" ? BOT_RESULTS.has(c.result) : c.result === filter);
  const keep = (c: Call) => byFilter(c)
    && (!q || matchCall(c, q));
  return newestFirst(calls.filter(keep));
}
