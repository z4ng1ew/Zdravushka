// Расписание врача на день (чистые функции): записи через Здравушку и сетка слотов по графику.

import { daySlots, type Doctor } from "@/shared/domain/doctors";
import { ticketDate, ticketTime } from "@/shared/domain/tickets";
import type { Ticket } from "@/shared/types/ticket";

/** Активные талоны врача на день */
export const doctorDayTickets = (all: Ticket[], doctor: Doctor, dayKey: string) =>
  all.filter((t) => t.doctor === doctor.fullName && ticketDate(t) === dayKey && t.status !== "Отменена");

/** Время слотов: по графику + время записей вне сетки */
export const slotTimes = (doctor: Doctor, day: Date, tickets: Ticket[]) =>
  Array.from(new Set([...daySlots(doctor, day), ...tickets.map(ticketTime)])).sort();

export const isPast = (day: Date, hm: string, now = new Date()) => {
  const [h, m] = hm.split(":").map(Number);
  const start = new Date(day);
  start.setHours(h, m, 0, 0);
  return start < now;
};
