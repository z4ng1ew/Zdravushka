// «Пилот сейчас» (чистая функция): итоги реальных разговоров из журнала /api/calls и обзвона.

import { isPassed, isSolved } from "@/shared/domain/callStats";
import { isReached } from "@/shared/domain/reminders";
import type { Call, Reminder } from "@/shared/types/staff";

export function pilotStats(calls: Call[], reminders: Reminder[]) {
  const real = calls.filter((c) => c.transcript.some((u) => u.speaker === "patient")); // пациент хоть что-то сказал
  return {
    total: real.length,
    solved: real.filter(isSolved).length,
    passed: real.filter(isPassed).length,
    booked: real.filter((c) => c.result === "записан").length,
    avgSec: real.length ? Math.round(real.reduce((s, c) => s + c.duration_sec, 0) / real.length) : 0,
    reached: reminders.filter(isReached).length,
    reminders: reminders.length,
  };
}
