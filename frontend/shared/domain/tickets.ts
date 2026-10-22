// Правила талонов (чистые функции): выдать, перенести, отменить; выборки по датам и пациентам.

import type { ChatBooking } from "../types/chat";
import type { Ticket, TicketsData } from "../types/ticket";
import { parseDT } from "./dates";
import { findDoctor, type Doctor } from "./doctors";
import { cabinetFrom, norm } from "./masking";

export const ticketDate = (t: Ticket) => t.scheduledAt.split(" ")[0];
export const ticketTime = (t: Ticket) => t.scheduledAt.split(" ")[1] ?? "";
export const byTime = (a: Ticket, b: Ticket) => ticketTime(a).localeCompare(ticketTime(b));
const active = (t: Ticket) => t.status === "Запланирована";
const nowISO = () => new Date().toISOString();

/** Ключ талона для списков React */
export const ticketKey = (t: Ticket) => `${t.number}|${t.createdAt}`;

function makeTicket(doc: Doctor, patient: string, at: string, visitId: number): Ticket {
  const now = nowISO();
  return {
    number: String(visitId), visitId, patient, doctor: doc.fullName, specialty: doc.specialty,
    cabinet: doc.cabinet, scheduledAt: at, status: "Запланирована", createdAt: now, updatedAt: now,
    history: [{ at: now, text: "Создана голосовым помощником" }],
  };
}

export interface BookingContext {
  patient: string; intent: string | null; reply?: string | null;
  doctors: Doctor[]; // справочник для ФИО, специальности и кабинета
}

/** Тот же пациент: по номеру записи МИС, иначе по маскированному ФИО */
const samePatient = (vid: number | null, patient: string) => (t: Ticket) =>
  (vid !== null && t.visitId === vid) || (!!patient && norm(t.patient) === norm(patient));

const note = (t: Ticket, text: string) => {
  const now = nowISO();
  t.updatedAt = now;
  t.history.push({ at: now, text });
  return { ...t };
};

/** Отмена: сначала по номеру записи, потом по пациенту и времени, потом любая активная запись пациента */
function cancelTicket(d: TicketsData, vid: number | null, same: (t: Ticket) => boolean, at: string): Ticket | null {
  const t = d.tickets.find((x) => vid !== null && x.visitId === vid && active(x))
    ?? d.tickets.find((x) => same(x) && active(x) && x.scheduledAt === at)
    ?? d.tickets.find((x) => same(x) && active(x));
  if (!t) return null;
  t.status = "Отменена";
  return note(t, "Отменена голосовым помощником");
}

/** Перенос: в МИС это новая запись (новый номер), прежняя отменена — талон получает новый номер */
function moveTicket(t: Ticket, doc: Doctor, at: string, vid: number): Ticket {
  const old = t.scheduledAt;
  Object.assign(t, { scheduledAt: at, doctor: doc.fullName, specialty: doc.specialty, cabinet: doc.cabinet,
    visitId: vid, number: String(vid) });
  return note(t, `Перенесена с ${old}`);
}

/** Применить запись из ответа бота к талонам. Меняет d, возвращает актуальный талон или null.
 *  Новый талон — только с номером записи из МИС: без него квитанция была бы выдуманной. */
export function applyBookingTo(d: TicketsData, b: ChatBooking, ctx: BookingContext): Ticket | null {
  const at = b.scheduled_at;
  if (!at || !b.status) return null;
  const vid = b.visit_id && b.visit_id > 0 ? b.visit_id : null;
  const same = samePatient(vid, ctx.patient);
  if (b.status === "Отменена") return cancelTicket(d, vid, same, at);
  if (b.status !== "Запланирована" || vid === null) return null;

  const cabinet = cabinetFrom(ctx.reply) ?? cabinetFrom(b.spoken);
  const doc = findDoctor(ctx.doctors, { name: b.doctor_name, id: b.doctor_id, cabinet });
  const dup = d.tickets.find((x) => same(x) && active(x) && x.scheduledAt === at && x.doctor === doc.fullName);
  if (dup) return { ...dup };
  const moved = ctx.intent === "reschedule" ? d.tickets.find((x) => same(x) && active(x)) : undefined;
  if (moved) return moveTicket(moved, doc, at, vid);
  const t = makeTicket(doc, ctx.patient, at, vid);
  d.tickets.unshift(t);
  return { ...t };
}

export interface PatientGroup { name: string; tickets: Ticket[]; next?: Ticket }

/** Талоны по пациентам (по маскированному ФИО — полных данных в браузере нет) */
export function groupPatients(tickets: Ticket[]): PatientGroup[] {
  const map = new Map<string, PatientGroup>();
  for (const t of tickets) {
    const key = norm(t.patient) || `запись ${t.number}`;
    if (!map.has(key)) map.set(key, { name: t.patient, tickets: [] });
    map.get(key)!.tickets.push(t);
  }
  const time = (t: Ticket) => parseDT(t.scheduledAt).getTime();
  return [...map.values()].map((p) => ({
    ...p,
    tickets: [...p.tickets].sort((a, b) => time(b) - time(a)),
    next: p.tickets.filter((t) => active(t) && time(t) > Date.now()).sort((a, b) => time(a) - time(b))[0],
  })).sort((a, b) => a.name.localeCompare(b.name, "ru"));
}

/** Поиск по талонам: врач, специальность, номер, дата, пациент */
export const matchTicket = (t: Ticket, q: string) =>
  !q || [t.patient, t.doctor, t.specialty, t.number, t.scheduledAt].some((v) => norm(v).includes(norm(q)));

/** Предстоящие (по времени) и прошедшие/отменённые (сначала свежие) */
export function splitTickets(list: Ticket[], now = new Date()): { upcoming: Ticket[]; rest: Ticket[] } {
  const sorted = [...list].sort((a, b) => parseDT(a.scheduledAt).getTime() - parseDT(b.scheduledAt).getTime());
  const upcoming = sorted.filter((t) => active(t) && parseDT(t.scheduledAt) >= now);
  return { upcoming, rest: sorted.filter((t) => !upcoming.includes(t)).reverse() };
}
