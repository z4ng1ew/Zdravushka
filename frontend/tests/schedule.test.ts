import { describe, expect, it } from "vitest";
import { doctorDayTickets, isPast, slotTimes } from "@/features/schedule/scheduleRules";
import { daySlots, findDoctor, shortName, slotMinutes, specialtyTitle, workingHours } from "@/shared/domain/doctors";
import type { Doctor } from "@/shared/types/doctor";
import type { Ticket } from "@/shared/types/ticket";

const MON = new Date(2026, 9, 19); // понедельник
const doc = (d: Partial<Doctor> = {}): Doctor =>
  ({ id: 1, fullName: "Иванова Анна Петровна", specialty: "Терапевт", cabinet: "101", weekly: { "Пн": "08:00–09:00" }, ...d });
const t = (scheduledAt: string, status: Ticket["status"] = "Запланирована"): Ticket => ({
  number: "1", visitId: 1, patient: "П. П.", doctor: "Иванова Анна Петровна", specialty: "Терапевт", cabinet: "101",
  scheduledAt, status, createdAt: scheduledAt, updatedAt: "", history: [],
});

describe("слоты приёма", () => {
  it("по графику и длительности приёма", () => {
    expect(daySlots(doc({ slotMin: 30 }), MON)).toEqual(["08:00", "08:30"]);
  });
  it("длительность 0, отрицательная или мусор с сервера — 20 минут (раньше страница зависала)", () => {
    expect([slotMinutes(doc({ slotMin: 0 })), slotMinutes(doc({ slotMin: -15 })), slotMinutes(doc({ slotMin: NaN }))]).toEqual([20, 20, 20]);
    expect(daySlots(doc({ slotMin: 0 }), MON)).toEqual(["08:00", "08:20", "08:40"]);
  });
  it("кривой график не ломает сетку", () => {
    expect(daySlots(doc({ weekly: { "Пн": "с утра" } }), MON)).toEqual([]);
    expect(daySlots(doc({ weekly: { "Пн": "08:00–20:00" }, slotMin: 5 }), MON).length).toBeLessThanOrEqual(200);
  });
  it("праздник и выходной — нет приёма", () => {
    expect(workingHours(doc(), new Date(2026, 10, 4))).toBeNull();
    expect(workingHours(doc(), new Date(2026, 9, 18))).toBeNull();
  });
  it("запись вне сетки тоже видна; отменённые не считаются", () => {
    const list = doctorDayTickets([t("19.10.2026 08:10"), t("19.10.2026 08:20", "Отменена")], doc(), "19.10.2026");
    expect(slotTimes(doc(), MON, list)).toEqual(["08:00", "08:10", "08:20", "08:40"]);
  });
  it("прошедший слот", () => {
    expect(isPast(MON, "08:00", new Date(2026, 9, 19, 9))).toBe(true);
    expect(isPast(MON, "10:00", new Date(2026, 9, 19, 9))).toBe(false);
  });
});

describe("подписи врача", () => {
  it("короткое ФИО и специальность", () => {
    expect([shortName("Иванова Анна Петровна"), shortName(""), specialtyTitle("Терапевт"), specialtyTitle("Врач УЗИ")])
      .toEqual(["Иванова А. П.", "", "Врач-терапевт", "Врач УЗИ"]);
  });
  it("findDoctor: по id, если по ФИО не нашли", () => {
    expect(findDoctor([doc()], { name: "Другой", id: 1 }).cabinet).toBe("101");
  });
});
