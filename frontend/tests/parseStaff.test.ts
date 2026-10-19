import { describe, expect, it } from "vitest";
import { parseCall, parseDoctor, parseHandoff, parseReminder } from "@/shared/api/parseStaff";

describe("parseCall — строка журнала /api/calls и /api/live", () => {
  it("без id — пропускаем", () => {
    expect(parseCall({ started_at: "19.10.2026 10:00" })).toBeNull();
    expect(parseCall("звонок")).toBeNull();
  });
  it("нет расшифровки и запросов к МИС — пустые списки (журнал не упадёт на .length)", () => {
    expect(parseCall({ id: "c1" })).toMatchObject({ transcript: [], stand_requests: [], duration_sec: 0, patient: null, direction: "входящий" });
  });
  it("реплики без текста и с чужим говорящим", () => {
    const c = parseCall({ id: "c1", transcript: [{ speaker: "bot", text: "Здравствуйте" }, { speaker: "робот", text: "?" }, { text: "" }, 5] });
    expect(c?.transcript.map((u) => u.speaker)).toEqual(["bot", "patient"]);
  });
  it("отрицательная длительность → 0; признак «идёт сейчас» сохраняется", () => {
    expect(parseCall({ id: "c1", duration_sec: -5, active: true })).toMatchObject({ duration_sec: 0, active: true });
  });
});

describe("parseHandoff — очередь переводов", () => {
  it("неизвестный статус → «новая»; collected — только простые значения", () => {
    const h = parseHandoff({ id: "h1", status: "непонятно", urgent: "да", collected: { "фамилия": "Петров", "x": [1] } });
    expect(h).toMatchObject({ status: "новая", urgent: false, collected: { "фамилия": "Петров" }, reason: "", transcript: [] });
  });
});

describe("parseReminder — обзвон", () => {
  it("без номера записи — пропускаем; номер строкой — число", () => {
    expect(parseReminder({ patient: "пациент № 3" })).toBeNull();
    expect(parseReminder({ visit_id: "15", doctor: null })).toMatchObject({ visit_id: 15, doctor: "", new_time: null });
  });
});

describe("parseDoctor — справочник /api/doctors", () => {
  it("без id или ФИО — пропускаем", () => {
    expect(parseDoctor({ fullName: "Иванова А. П." })).toBeNull();
    expect(parseDoctor({ id: 1 })).toBeNull();
  });
  it("кабинет числом → строка; специальности нет → «Врач»; график без вложенного мусора", () => {
    const d = parseDoctor({ id: "3", fullName: "Иванова Анна Петровна", cabinet: 214, weekly: { "Пн": "08:00–14:00", "Вт": null } });
    expect(d).toMatchObject({ id: 3, cabinet: "214", specialty: "Врач", weekly: { "Пн": "08:00–14:00" } });
  });
});
