// Разбор ответов кабинета: /api/calls, /api/live, /api/handoffs, /api/reminders, /api/doctors.
// Обязательное поле нет — элемент пропускаем; необязательное — подставляем пустое значение.

import type { Doctor } from "../types/doctor";
import type { Call, CallResult, Handoff, HandoffStatus, Reminder, StandRequest, Utterance } from "../types/staff";
import { isObj, num, numOrNull, oneOf, softList, str, strOrNull, textRecord } from "./parse";

const SPEAKERS = ["patient", "bot", "operator"] as const;
const METHODS = ["GET", "POST", "PATCH"] as const;
const HANDOFF_STATUSES: readonly HandoffStatus[] = ["новая", "в работе", "перезвонили", "закрыта"];

export function parseUtterance(v: unknown): Utterance | null {
  if (!isObj(v) || !str(v.text)) return null;
  const confidence = numOrNull(v.confidence);
  return {
    speaker: oneOf(v.speaker, SPEAKERS, "patient"), text: str(v.text), at: str(v.at),
    ...(confidence === null ? {} : { confidence }),
  };
}

export function parseStandRequest(v: unknown): StandRequest | null {
  if (!isObj(v)) return null;
  return { method: oneOf(v.method, METHODS, "GET"), path: str(v.path, "?"), status: num(v.status), note: str(v.note) };
}

export function parseCall(v: unknown): Call | null {
  if (!isObj(v) || !str(v.id)) return null;
  return {
    id: str(v.id),
    direction: v.direction === "исходящий" ? "исходящий" : "входящий",
    started_at: str(v.started_at),
    duration_sec: Math.max(0, num(v.duration_sec)),
    intent: str(v.intent),
    result: str(v.result) as CallResult,
    patient: strOrNull(v.patient),
    transcript: softList(v.transcript, parseUtterance),
    stand_requests: softList(v.stand_requests, parseStandRequest),
    ...(typeof v.active === "boolean" ? { active: v.active } : {}),
  };
}

export function parseHandoff(v: unknown): Handoff | null {
  if (!isObj(v) || !str(v.id)) return null;
  return {
    id: str(v.id), call_id: str(v.call_id), created_at: str(v.created_at),
    reason: str(v.reason), urgent: v.urgent === true,
    status: oneOf(v.status, HANDOFF_STATUSES, "новая"),
    phone: str(v.phone), summary: str(v.summary),
    collected: textRecord(v.collected), transcript: softList(v.transcript, parseUtterance),
  };
}

export function parseReminder(v: unknown): Reminder | null {
  const visitId = isObj(v) ? numOrNull(v.visit_id) : null;
  if (!isObj(v) || visitId === null) return null;
  return {
    visit_id: visitId, patient: str(v.patient), doctor: str(v.doctor), specialty: str(v.specialty),
    scheduled_at: str(v.scheduled_at), status: str(v.status), new_time: strOrNull(v.new_time),
  };
}

export function parseDoctor(v: unknown): Doctor | null {
  const id = isObj(v) ? numOrNull(v.id) : null;
  if (!isObj(v) || id === null || !str(v.fullName)) return null;
  const slotMin = numOrNull(v.slotMin);
  return {
    id, fullName: str(v.fullName), specialty: str(v.specialty, "Врач"), cabinet: str(v.cabinet),
    department: str(v.department) || undefined, patients: str(v.patients) || undefined,
    slotMin: slotMin === null ? undefined : slotMin, weekly: textRecord(v.weekly),
  };
}
