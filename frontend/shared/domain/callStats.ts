// Показатели по журналу звонков (/api/calls): сегодня против вчера, доли решённых и переданных.

import type { Call, Reminder } from "../types/staff";
import { addDays, keyOf, parseDT, splitDT } from "./dates";
import { statusKey } from "./reminders";

const SOLVED = new Set(["записан", "перенесён", "отменён", "справка"]);
const NOT_SENT = new Set(["ожидает", "в очереди"]); // напоминание ещё не прозвучало

export const isSolved = (c: Call) => SOLVED.has(c.result);
export const isPassed = (c: Call) => c.result === "переведён";

/** Изменение в процентах к прошлому периоду; null — сравнивать не с чем */
export function pctDelta(now: number, before: number): number | null {
  if (!before) return null;
  return Math.round(((now - before) / before) * 100);
}

const onDay = (calls: Call[], key: string) => calls.filter((c) => splitDT(c.started_at).date === key);

export interface DayKpi {
  total: number; totalD: number | null;
  solved: number; solvedD: number | null;
  passed: number; passedD: number | null;
  sent: number; remindTotal: number;
}

export function dayKpi(calls: Call[], reminders: Reminder[], now = new Date()): DayKpi {
  const t = onDay(calls, keyOf(now));
  const y = onDay(calls, keyOf(addDays(now, -1)));
  const count = (l: Call[], f: (c: Call) => boolean) => l.filter(f).length;
  const sent = reminders.filter((r) => !NOT_SENT.has(statusKey(r.status))).length;
  return {
    total: t.length, totalD: pctDelta(t.length, y.length),
    solved: count(t, isSolved), solvedD: pctDelta(count(t, isSolved), count(y, isSolved)),
    passed: count(t, isPassed), passedD: pctDelta(count(t, isPassed), count(y, isPassed)),
    sent, remindTotal: reminders.length,
  };
}

/** «12.5% от всех звонков» */
export const shareText = (n: number, total: number) =>
  total ? `${((n / total) * 100).toFixed(1)}% от всех звонков` : "от всех звонков";

/** Сначала свежие звонки (не полагаемся на порядок сервера) */
export const newestFirst = (calls: Call[]) =>
  [...calls].sort((a, b) => parseDT(b.started_at).getTime() - parseDT(a.started_at).getTime());
