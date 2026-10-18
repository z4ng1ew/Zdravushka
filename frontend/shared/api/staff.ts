// Данные кабинета регистратора — только с сервера. Фронт никогда не обращается к МИС напрямую.

import type { Call, Handoff, HandoffStatus, Reminder } from "../types/staff";
import { request } from "./http";

export const getCalls = () => request<Call[]>("GET", "/api/calls", "журнал звонков");

export const getHandoffs = () => request<Handoff[]>("GET", "/api/handoffs", "очередь оператора");

export const updateHandoff = (id: string, status: HandoffStatus) =>
  request<Handoff>("PATCH", `/api/handoffs/${id}`, "очередь оператора", { status });

export const getReminders = () => request<Reminder[]>("GET", "/api/reminders", "напоминания");

/** Обзвонить всех, кто ждёт напоминания → { queued, note? } */
export const runReminders = () =>
  request<{ queued?: number; note?: string }>("POST", "/api/reminders/run", "напоминания");

/** Позвонить одному пациенту (409 — идёт другой звонок, 404 — запись не найдена) */
export const callReminder = (visitId: number) =>
  request<{ queued?: number }>("POST", `/api/reminders/${visitId}/call`, "напоминания");
