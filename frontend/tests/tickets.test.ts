import { describe, expect, it } from "vitest";
import { applyBookingTo, splitTickets } from "@/shared/domain/tickets";
import type { TicketsData } from "@/shared/types/ticket";
import { booking } from "./fixtures";

const empty = (): TicketsData => ({ v: 1, tickets: [] });
const doctors = [{ id: 5, fullName: "Иванова Анна Петровна", specialty: "Терапевт", cabinet: "214" }];
const ctx = { patient: "Петров П. П.", intent: "booking", doctors };

describe("applyBookingTo — талоны из ответов бота", () => {
  it("новая запись — талон с номером записи из МИС, а не придуманным", () => {
    const d = empty();
    const t = applyBookingTo(d, booking({ visit_id: 93 }), ctx);
    expect(d.tickets).toHaveLength(1);
    expect(t).toMatchObject({ number: "93", visitId: 93, patient: "Петров П. П." });
  });
  it("нет номера записи в МИС — талон не выдаётся (квитанция была бы выдуманной)", () => {
    expect(applyBookingTo(empty(), booking({ visit_id: null }), ctx)).toBeNull();
    expect(applyBookingTo(empty(), booking({ visit_id: 0 }), ctx)).toBeNull();
  });
  it("специальность и кабинет — из справочника врачей", () => {
    const t = applyBookingTo(empty(), booking(), ctx);
    expect(t).toMatchObject({ number: "7", specialty: "Терапевт", cabinet: "214" });
  });
  it("повтор той же записи не создаёт второй талон", () => {
    const d = empty();
    applyBookingTo(d, booking(), ctx);
    applyBookingTo(d, booking(), ctx);
    expect(d.tickets).toHaveLength(1);
  });
  it("перенос меняет время у существующего талона", () => {
    const d = empty();
    applyBookingTo(d, booking(), ctx);
    applyBookingTo(d, booking({ scheduled_at: "22.10.2026 12:00" }), { ...ctx, intent: "reschedule" });
    expect(d.tickets).toHaveLength(1);
    expect(d.tickets[0].scheduledAt).toBe("22.10.2026 12:00");
    expect(d.tickets[0].history.at(-1)?.text).toBe("Перенесена с 20.10.2026 10:30");
  });
  it("перенос в МИС — новая запись: талон получает её номер", () => {
    const d = empty();
    applyBookingTo(d, booking({ visit_id: 93 }), ctx);
    const t = applyBookingTo(d, booking({ visit_id: 94, scheduled_at: "22.10.2026 12:00" }), { ...ctx, intent: "reschedule" });
    expect(d.tickets).toHaveLength(1);
    expect(t).toMatchObject({ number: "94", visitId: 94 });
  });
  it("отмена по номеру записи МИС", () => {
    const d = empty();
    applyBookingTo(d, booking(), ctx);
    applyBookingTo(d, booking({ status: "Отменена" }), { ...ctx, intent: "cancel" });
    expect(d.tickets[0].status).toBe("Отменена");
  });
  it("без времени — ничего не делаем", () => {
    expect(applyBookingTo(empty(), booking({ scheduled_at: null }), ctx)).toBeNull();
  });
});

describe("splitTickets", () => {
  it("предстоящие отдельно от прошедших", () => {
    const d = empty();
    applyBookingTo(d, booking({ scheduled_at: "20.10.2026 10:30", visit_id: 1 }), ctx);
    applyBookingTo(d, booking({ scheduled_at: "01.01.2020 10:30", visit_id: 2 }), { ...ctx, patient: "Сидоров С. С." });
    const { upcoming, rest } = splitTickets(d.tickets, new Date(2026, 9, 18));
    expect(upcoming.map((t) => t.visitId)).toEqual([1]);
    expect(rest.map((t) => t.visitId)).toEqual([2]);
  });
});
