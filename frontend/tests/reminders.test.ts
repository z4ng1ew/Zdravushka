import { describe, expect, it } from "vitest";
import { reminderView } from "@/shared/domain/reminders";

describe("reminderView — статусы обзвона", () => {
  it.each([
    ["ожидает", "Ожидает звонка", "wait"],
    ["в очереди", "Звоним…", "call"],
    ["подтвердил", "Придёт", "ok"],
    ["отменил", "Отменил — слот свободен", "cancel"],
    ["без ответа", "Не дозвонились", "miss"],
    ["ошибка звонка", "Ошибка телефонии", "err"],
  ])("%s → %s", (status, text, group) => {
    expect(reminderView(status)).toMatchObject({ text, group });
  });
  it("«перенёс» с ё и новым временем", () => {
    expect(reminderView("Перенёс", "21.10 09:00").text).toBe("Перенёс на 21.10 09:00");
  });
  it("незнакомый статус — как есть, серым", () => {
    expect(reminderView("новый")).toMatchObject({ text: "новый", cls: "sp-grey", group: "other" });
  });
  it("жёлтого цвета нет ни у одного статуса", () => {
    const all = ["ожидает", "звоним", "подтвердил", "перенес", "отменил", "не дозвонились", "ошибка звонка"];
    expect(all.map((s) => reminderView(s).cls).join(" ")).not.toMatch(/yellow|amber/);
  });
});
