// Данные кабинета регистратора — только с сервера. Фронт никогда не обращается к МИС напрямую.
// Списки проверяются на входе (parseStaff.ts): негодные строки пропускаются, не список — ошибка 502.

import type { Call, Handoff, HandoffStatus, Reminder } from "../types/staff";
import { request } from "./http";
import { isObj, list, num, str } from "./parse";
import { parseCall, parseHandoff, parseReminder } from "./parseStaff";

export const getCalls = (): Promise<Call[]> =>
  request("GET", "/api/calls", "журнал звонков", { parse: (raw) => list(raw, parseCall, "звонки") });

/** Телефонные звонки, которые идут прямо сейчас (с расшифровкой); [] — звонков нет */
export const getLiveCalls = (): Promise<Call[]> =>
  request("GET", "/api/live", "звонок сейчас", { parse: (raw) => list(raw, parseCall, "звонки") });

export const getHandoffs = (): Promise<Handoff[]> =>
  request("GET", "/api/handoffs", "очередь оператора", { parse: (raw) => list(raw, parseHandoff, "переводы") });

export const updateHandoff = (id: string, status: HandoffStatus) =>
  request<unknown>("PATCH", `/api/handoffs/${encodeURIComponent(id)}`, "очередь оператора", { body: { status } });

export const getReminders = (): Promise<Reminder[]> =>
  request("GET", "/api/reminders", "напоминания", { parse: (raw) => list(raw, parseReminder, "напоминания") });

export interface RunResult { queued?: number; note?: string }

const parseRun = (raw: unknown): RunResult => (isObj(raw)
  ? { ...(raw.queued !== undefined ? { queued: num(raw.queued) } : {}), ...(str(raw.note) ? { note: str(raw.note) } : {}) }
  : {});

/** Обзвонить всех, кто ждёт напоминания → { queued, note? } */
export const runReminders = () => request("POST", "/api/reminders/run", "напоминания", { parse: parseRun });

/** Позвонить одному пациенту (409 — идёт другой звонок, 404 — запись не найдена) */
export const callReminder = (visitId: number) =>
  request("POST", `/api/reminders/${visitId}/call`, "напоминания", { parse: parseRun });
