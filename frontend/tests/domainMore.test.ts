import { describe, expect, it } from "vitest";
import { recordTag, statusText } from "@/features/call/model/callView";
import { callReducer, initialCall } from "@/features/call/model/callState";
import { toUiBooking } from "@/shared/domain/booking";
import { intentLabel } from "@/shared/domain/intents";
import { misExtras, misView } from "@/shared/domain/misMode";
import { failedRequests, isMisFailure } from "@/shared/domain/standRequests";
import { groupPatients, matchTicket } from "@/shared/domain/tickets";
import type { Ticket } from "@/shared/types/ticket";
import { booking, call } from "./fixtures";

const t = (patient: string, scheduledAt: string, visitId = 1, status: Ticket["status"] = "Запланирована"): Ticket => ({
  number: String(visitId), visitId, patient, doctor: "Иванова Анна Петровна", specialty: "Терапевт", cabinet: "101",
  scheduledAt, status, createdAt: String(visitId), updatedAt: "", history: [],
});
const quiet = { listening: false, transcribing: false, speaking: false };

describe("сбои МИС для страницы «Ошибки»", () => {
  it("запрос к МИС не 200/201 — сбой; 0 — нет ответа", () => {
    const reqs = [{ method: "GET" as const, path: "/visits", status: 200 }, { method: "POST" as const, path: "/visits", status: 0 }];
    expect(failedRequests(reqs).map((r) => r.status)).toEqual([0]);
    expect(isMisFailure(call({ stand_requests: reqs }))).toBe(true);
  });
  it("перевод из-за слов бота «МИС не отвечает» — тоже сбой; обычный перевод — нет", () => {
    const say = (text: string) => [{ speaker: "bot" as const, text, at: "" }];
    expect(isMisFailure(call({ result: "переведён", transcript: say("Система записи не отвечает, соединяю") }))).toBe(true);
    expect(isMisFailure(call({ result: "переведён", transcript: say("Соединяю с регистратором") }))).toBe(false);
  });
});

describe("подписи и плашки", () => {
  it("цель звонка: известная — по-русски, новая — как есть, нет — «—»", () => {
    expect([intentLabel("booking"), intentLabel("new_thing"), intentLabel(null)]).toEqual(["Запись к врачу", "new_thing", "—"]);
  });
  it("плашка МИС: неизвестный режим показывается как есть; подсказки про 152-ФЗ и «без нейросети»", () => {
    expect(misView({ status: "ok", mode: "test" }).text).toBe("Режим: test");
    expect(misExtras({ status: "ok", pd_trusted_ai_only: true, llm: false })).toHaveLength(2);
    expect(misExtras({ status: "ok" })).toEqual([]);
  });
  it("отмена в имитации МИС — честная подпись", () => {
    expect(toUiBooking(booking({ status: "Отменена" }), "cancel", "mock").note).toBe("Отмена сохранена в имитации МИС");
  });
});

describe("пациенты и поиск талонов", () => {
  const list = [t("Петров П. П.", "20.10.2030 10:00", 91), t("петров п. п.", "21.10.2030 10:00", 92), t("", "22.10.2030 10:00", 93)];
  it("группировка по ФИО без учёта регистра; без ФИО — отдельной строкой по номеру талона", () => {
    const g = groupPatients(list);
    expect(g.map((p) => p.tickets.length)).toEqual([1, 2]);
    expect(g[1].next?.number).toBe("91");
  });
  it("поиск: по номеру, врачу и дате; «ё» и регистр не важны", () => {
    expect(list.filter((x) => matchTicket(x, "92")).map((x) => x.number)).toEqual(["92"]);
    expect(list.filter((x) => matchTicket(x, "ИВАНОВА")).length).toBe(3);
    expect(matchTicket(list[0], "")).toBe(true);
  });
});

describe("звонок: остальные состояния", () => {
  const active = callReducer(initialCall, { type: "reset" });
  it("подписи под микрофоном: распознаю, думает, говорит, слушаю", () => {
    expect(statusText(active, { ...quiet, transcribing: true })).toBe("Распознаю речь…");
    expect(statusText({ ...active, sending: true }, quiet)).toBe("Помощник думает…");
    expect(statusText(active, { ...quiet, speaking: true })).toBe("Помощник говорит…");
    const patientLast = callReducer(active, { type: "line", line: { speaker: "patient", text: "да" } });
    expect(statusText(patientLast, quiet)).toBe("Слушаю вас…");
    expect(statusText({ ...active, mode: "operator" }, quiet)).toBe("Регистратор слушает вас…");
  });
  it("метка «Запись на приём»: варианты, талон, ожидание подтверждения", () => {
    expect(recordTag({ ...active, options: [booking(), booking()] }).text).toBe("Варианты: 2");
    expect(recordTag({ ...active, ticket: t("П.", "20.10.2030 10:00", 7) }).text).toBe("Талон к записи № 7");
    expect(recordTag({ ...active, booking: toUiBooking(booking({ status: null }), "booking", "stand") }).cls).toBe("tag-warn");
    expect(recordTag({ ...active, mode: "operator" }).text).toBe("Ведёт регистратор");
  });
});
