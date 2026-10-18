// Заготовки ответов сервера для тестов: меняем только нужные поля.
import type { ChatBooking, ChatResponse } from "@/shared/types/chat";
import type { Call, Handoff } from "@/shared/types/staff";

export const booking = (b: Partial<ChatBooking> = {}): ChatBooking => ({
  visit_id: 7, doctor_id: null, doctor_name: "Иванова Анна Петровна", specialty: "Терапевт",
  scheduled_at: "20.10.2026 10:30", spoken: null, status: "Запланирована", ...b,
});

export const reply = (r: Partial<ChatResponse> = {}): ChatResponse => ({
  session_id: "s1", reply: "Готово", intent: "booking", collected: {}, options: [],
  booking: null, escalation: null, done: false, ...r,
});

export const call = (c: Partial<Call> = {}): Call => ({
  id: "c1", direction: "входящий", started_at: "18.10.2026 09:00", duration_sec: 60,
  intent: "booking", result: "записан", patient: null, transcript: [], ...c,
} as Call);

export const handoff = (h: Partial<Handoff> = {}): Handoff => ({
  id: "h1", call_id: "c1", created_at: "18.10.2026 09:00", reason: "жалоба", urgent: false,
  status: "новая", phone: "+7 *** 12", summary: "", collected: {}, transcript: [], ...h,
});
