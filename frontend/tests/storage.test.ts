// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/api/ApiError";
import { logError, readErrors, toLogText } from "@/shared/api/errorLog";
import { applyBookingTo } from "@/shared/domain/tickets";
import { loadTickets, mutateTickets } from "@/shared/store/ticketStorage";
import { booking } from "./fixtures";

const day = (offset: number) => {
  const d = new Date(Date.now() + offset * 86_400_000);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()} 10:00`;
};
const ticket = (extra: Record<string, unknown> = {}) => ({
  number: "1", visitId: 1, patient: "Петров П. П.", doctor: "Иванова А. П.", specialty: "Терапевт", cabinet: "214",
  scheduledAt: day(2), status: "Запланирована", createdAt: "x", updatedAt: "x", history: [], ...extra,
});
const store = (v: unknown) => localStorage.setItem("clinicai-store", JSON.stringify(v));

beforeEach(() => { localStorage.clear(); vi.spyOn(console, "error").mockImplementation(() => {}); });

describe("журнал ошибок в браузере", () => {
  it("испорченный журнал (объект вместо списка) — пусто, а не падение страницы «Ошибки»", () => {
    localStorage.setItem("clinicai-errors", JSON.stringify({ a: 1 }));
    expect(readErrors()).toEqual([]);
  });
  it("чужие записи пропускаются, хорошие остаются", () => {
    localStorage.setItem("clinicai-errors", JSON.stringify([null, { at: "не дата" }, { at: "2026-10-19T10:00:00Z", status: "500", message: 5 }]));
    expect(readErrors()).toEqual([{ at: "2026-10-19T10:00:00Z", status: null, method: "", path: "", message: "", where: "" }]);
  });
  it("после испорченного журнала новые ошибки снова пишутся", () => {
    localStorage.setItem("clinicai-errors", "{не json");
    logError(new ApiError(503, "GET", "/api/calls", "МИС недоступна"), "опрос");
    expect(readErrors()).toHaveLength(1);
    expect(toLogText(readErrors())).toContain("503 | GET /api/calls | опрос | МИС недоступна");
  });
});

describe("талоны в браузере", () => {
  it("старая запись с датой рождения и полным ФИО — маскируется, дата рождения удаляется", () => {
    store({ v: 1, tickets: [ticket({ patient: "Петров Пётр Петрович", birth: "01.01.1980" })] });
    const t = loadTickets().tickets[0] as unknown as Record<string, unknown>;
    expect(t.patient).toBe("Петров П. П.");
    expect(t.birth).toBeUndefined();
  });
  it("недостающие поля — строки по умолчанию (карточка талона не упадёт)", () => {
    store({ v: 1, tickets: [ticket({ doctor: null, specialty: 5, cabinet: undefined })] });
    expect(loadTickets().tickets[0]).toMatchObject({ doctor: "Врач", specialty: "", cabinet: "—", visitId: 1 });
  });
  it("талоны старше 30 дней после приёма удаляются", () => {
    store({ v: 1, tickets: [ticket({ visitId: 1, scheduledAt: day(-40) }), ticket({ visitId: 2 })] });
    expect(loadTickets().tickets.map((t) => t.number)).toEqual(["2"]);
  });
  it("старый талон с придуманным номером («Т-015») без записи МИС — убирается; с записью — номер из МИС", () => {
    store({ v: 1, seq: { "Т": 15 }, tickets: [ticket({ number: "Т-015", visitId: null }), ticket({ number: "Т-016", visitId: 93 })] });
    expect(loadTickets().tickets.map((t) => t.number)).toEqual(["93"]);
  });
  it("новый талон в браузере — номер записи из ответа сервера", () => {
    const t = mutateTickets((d) => applyBookingTo(d, booking({ scheduled_at: day(1), visit_id: 10 }), { patient: "Петров П. П.", intent: "booking", doctors: [] }));
    expect(t?.number).toBe("10");
    expect(loadTickets().tickets).toHaveLength(1);
  });
  it("хранилище не того формата — пусто", () => {
    localStorage.setItem("clinicai-store", "[1,2,3]");
    expect(loadTickets()).toEqual({ v: 1, tickets: [] });
  });
});
