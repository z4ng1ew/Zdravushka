import { describe, expect, it } from "vitest";
import { applyBookingTo, splitTickets } from "@/shared/domain/tickets";
import type { TicketsData } from "@/shared/types/ticket";
import { booking } from "./fixtures";

const empty = (): TicketsData => ({ v: 1, tickets: [], seq: {} });
const ctx = { patient: "Петров П. П.", intent: "booking" };

describe("applyBookingTo — талоны из ответов бота", () => {
  it("новая запись — талон с номером по букве специальности", () => {
    const d = empty();
    const t = applyBookingTo(d, booking({ specialty: "Терапевт" }), ctx);
    expect(d.tickets).toHaveLength(1);
    expect(t?.number).toMatch(/^[А-ЯA-Z]-001$/);
    expect(t?.patient).toBe("Петров П. П.");
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
