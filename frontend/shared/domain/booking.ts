// Правила по записи из ответа /api/chat: карточка «Запись на приём» и когда выдавать талон.

import type { ChatBooking, ChatResponse, UiBooking } from "../types/chat";
import type { MisMode } from "./misMode";

const where = (mis: MisMode) => (mis === "mock" ? " (имитация МИС)" : mis === "none" ? "" : " в МИС");

function bookedTitle(intent: string | null, mis: MisMode): string {
  if (intent === "reschedule") return `Перенесено${where(mis)}`;
  if (intent === "cancel" || intent === "status") return "Запись найдена";
  return `Записано${where(mis)}`;
}

/** Карточка записи для экрана из booking ответа */
export function toUiBooking(b: ChatBooking, intent: string | null, mis: MisMode): UiBooking {
  const [date, time] = (b.scheduled_at ?? "").split(" ");
  const base = {
    doctor: b.doctor_name ?? "Врач", specialty: b.specialty ?? "", date, time,
    spoken: b.spoken ?? undefined, statusText: b.status ?? "ожидает подтверждения",
    visitId: b.visit_id && b.visit_id > 0 ? b.visit_id : null,
  };
  if (b.status === "Отменена") {
    const note = mis === "mock" ? "Отмена сохранена в имитации МИС" : "Отмена сохранена в МИС, время освободилось";
    return { ...base, kind: "cancelled", title: "Запись отменена", note };
  }
  if (b.status === "Запланирована") {
    const note = b.visit_id ? `Запись № ${b.visit_id}` : "Запись подтверждена";
    return { ...base, kind: "booked", title: bookedTitle(intent, mis), note };
  }
  return { ...base, kind: "pending", title: "Ожидает подтверждения", note: "Скажите «да», чтобы подтвердить" };
}

/**
 * Выдать/обновить талон только на завершённом шаге (status = completed): запись, перенос или отмена.
 * На шаге «Отменяю запись… Верно?» бэкенд показывает существующую запись — талон по ней не создаём.
 */
export function shouldIssueTicket(r: ChatResponse): boolean {
  if (!r.booking) return false;
  const finished = !r.status || r.status === "completed";
  const action = r.booking.status === "Отменена"
    || (r.booking.status === "Запланирована" && (r.intent === "booking" || r.intent === "reschedule"));
  return finished && action;
}
