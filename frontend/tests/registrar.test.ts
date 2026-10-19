import { describe, expect, it } from "vitest";
import { filterJournal, flagLabels } from "@/features/registrar/journal/journalView";
import { handoffPatient, matchHandoff } from "@/features/registrar/queue/queueRules";
import { pilotStats } from "@/features/stats/pilotStats";
import { dayKpi, newestFirst } from "@/shared/domain/callStats";
import { canRunReminders, isReached, remindersDay, sortReminders } from "@/shared/domain/reminders";
import type { Reminder } from "@/shared/types/staff";
import { call, handoff } from "./fixtures";

const rem = (scheduled_at: string, status = "ожидает", visit_id = 1): Reminder =>
  ({ visit_id, patient: "пациент", doctor: "Иванова А. П.", specialty: "Терапевт", scheduled_at, status });

describe("обзвон", () => {
  it("сортировка по настоящему времени: 31.10 раньше 02.11 (строкой было бы наоборот)", () => {
    const list = [rem("02.11.2026 08:00", "ожидает", 1), rem("31.10.2026 09:00", "ожидает", 2), rem("31.10.2026 08:00", "ожидает", 3)];
    expect(sortReminders(list).map((r) => r.visit_id)).toEqual([3, 2, 1]);
    expect(remindersDay(list)).toBe("31.10.2026");
  });
  it("«Обзвонить всех» доступно, если кто-то ждёт — регистр и «ё» не важны", () => {
    expect(canRunReminders([rem("31.10.2026 08:00", "Ожидает ")])).toBe(true);
    expect(canRunReminders([rem("31.10.2026 08:00", "подтвердил")])).toBe(false);
    expect(remindersDay([])).toBe("");
  });
  it("ответили на напоминание: придёт, перенёс («перенес» тоже), отменил", () => {
    expect(["подтвердил", "перенес", "Перенёс", "отменил", "не дозвонились", "ожидает"].map((s) => isReached(rem("", s))))
      .toEqual([true, true, true, true, false, false]);
  });
  it("«Напоминаний отправлено» не считает тех, кому ещё не звонили (в любом регистре)", () => {
    const k = dayKpi([], [rem("", "Ожидает"), rem("", "в очереди"), rem("", "подтвердил")]);
    expect([k.sent, k.remindTotal]).toEqual([1, 3]);
  });
});

describe("журнал звонков", () => {
  const calls = [
    call({ id: "old", started_at: "18.10.2026 09:00" }),
    call({ id: "new", started_at: "19.10.2026 08:00" }),
    call({ id: "mid", started_at: "18.10.2026 17:30", result: "справка" }),
  ];
  it("сначала свежие — не полагаемся на порядок сервера", () => {
    expect(newestFirst(calls).map((c) => c.id)).toEqual(["new", "mid", "old"]);
  });
  it("фильтр «Записи, переносы, отмены» и «Все звонки»", () => {
    expect(filterJournal(calls, "bot").map((c) => c.id)).toEqual(["new", "old"]);
    expect(filterJournal(calls, "all")).toHaveLength(3);
    expect(filterJournal(calls, "справка").map((c) => c.id)).toEqual(["mid"]);
  });
  it("отметка «попытка промпт-инъекции» (flags): подпись, фильтр и поиск", () => {
    const list = [call({ id: "x", flags: ["prompt_injection"] }), call({ id: "y" }), call({ id: "z", flags: ["странное"] })];
    expect(flagLabels(list[0])).toEqual(["⚠︎ попытка промпт-инъекции"]);
    expect(flagLabels(list[1])).toEqual([]);
    expect(flagLabels(list[2])).toEqual(["⚠︎ странное"]);
    expect(filterJournal(list, "flagged").map((c) => c.id).sort()).toEqual(["x", "z"]);
    expect(filterJournal(list, "all", "инъекц").map((c) => c.id)).toEqual(["x"]);
  });
  it("поиск по пациенту и итогу, без учёта регистра", () => {
    const list = [call({ id: "a", patient: "Петров П. П." }), call({ id: "b", patient: "Сидоров С. С.", result: "отменён" })];
    expect(filterJournal(list, "all", "петров").map((c) => c.id)).toEqual(["a"]);
    expect(filterJournal(list, "all", "отменена").map((c) => c.id)).toEqual(["b"]);
    expect(filterJournal(list, "all", "иванов")).toEqual([]);
  });
  it("длинный журнал целиком (дальше — по страницам), сначала свежие", () => {
    const many = Array.from({ length: 60 }, (_, i) => call({ id: `c${i}`, started_at: `18.10.2026 ${String(8 + Math.floor(i / 6)).padStart(2, "0")}:${String((i % 6) * 10).padStart(2, "0")}` }));
    const shown = filterJournal(many, "all");
    expect(shown).toHaveLength(60);
    expect(shown[0].id).toBe("c59");
  });
});

describe("очередь и пилот", () => {
  it("ФИО в очереди только маскированное; не назвался — пусто", () => {
    expect(handoffPatient(handoff({ collected: { "фамилия": "Петров", "имя": "Пётр", "отчество": "Петрович" } }))).toBe("Петров П. П.");
    expect(handoffPatient(handoff())).toBe("");
  });
  it("поиск по очереди: пациент (маскированный), причина, телефон, собранные поля", () => {
    const h = handoff({ reason: "жалоба", phone: "+7 *** 12", collected: { "фамилия": "Петров", "имя": "Пётр", "врач": "кардиолог" } });
    expect(["петров п", "ЖАЛОБ", "*** 12", "кардиолог", ""].map((q) => matchHandoff(h, q))).toEqual([true, true, true, true, true]);
    expect(matchHandoff(h, "Пётр Петрович")).toBe(false); // полное имя не ищется — в очереди только инициалы
  });
  it("пилот считает только разговоры, где пациент что-то сказал", () => {
    const talk = [{ speaker: "patient" as const, text: "да", at: "" }];
    const p = pilotStats([call({ transcript: talk, duration_sec: 30 }), call({ transcript: [], duration_sec: 300 })], [rem("", "перенёс")]);
    expect(p).toMatchObject({ total: 1, avgSec: 30, reached: 1, reminders: 1 });
  });
});
