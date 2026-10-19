// Действия с талонами из ответа бота: правило «когда выдавать» + применение + сохранение.

import { shouldIssueTicket } from "../domain/booking";
import { pickPatient } from "../domain/masking";
import { applyBookingTo } from "../domain/tickets";
import type { ChatResponse } from "../types/chat";
import type { Ticket } from "../types/ticket";
import { doctorsNow } from "./doctorDirectory";
import { mutateTickets } from "./ticketStorage";

/** Выдать, перенести или отменить талон по ответу /api/chat. null — талон не меняется. */
export function issueTicket(r: ChatResponse): Ticket | null {
  const booking = r.booking;
  if (!booking || !shouldIssueTicket(r)) return null;
  const ctx = { patient: pickPatient(r.collected), intent: r.intent, reply: r.reply, doctors: doctorsNow() };
  return mutateTickets((d) => applyBookingTo(d, booking, ctx));
}
