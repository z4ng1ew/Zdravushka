import { describe, expect, it } from "vitest";
import { shouldIssueTicket, toUiBooking } from "@/shared/domain/booking";
import { booking, reply } from "./fixtures";

describe("shouldIssueTicket — когда выдавать талон", () => {
  it("завершённая запись — да", () => {
    expect(shouldIssueTicket(reply({ status: "completed", booking: booking() }))).toBe(true);
  });
  it("шаг подтверждения отмены (in_progress) — нет", () => {
    expect(shouldIssueTicket(reply({ status: "in_progress", intent: "cancel", booking: booking() }))).toBe(false);
  });
  it("проверка статуса записи — нет", () => {
    expect(shouldIssueTicket(reply({ status: "completed", intent: "status", booking: booking() }))).toBe(false);
  });
  it("отмена — да", () => {
    expect(shouldIssueTicket(reply({ status: "completed", intent: "cancel", booking: booking({ status: "Отменена" }) }))).toBe(true);
  });
  it("без записи — нет", () => {
    expect(shouldIssueTicket(reply({ status: "completed" }))).toBe(false);
  });
});

describe("toUiBooking — карточка записи", () => {
  it("перенос в имитации МИС", () => {
    expect(toUiBooking(booking(), "reschedule", "mock")).toMatchObject({ kind: "booked", title: "Перенесено (имитация МИС)", time: "10:30" });
  });
  it("не подтверждена — ждём «да»", () => {
    expect(toUiBooking(booking({ status: null }), "booking", "stand").kind).toBe("pending");
  });
  it("номер записи 0 не показываем", () => {
    expect(toUiBooking(booking({ visit_id: 0 }), "booking", "stand").visitId).toBeNull();
  });
});
