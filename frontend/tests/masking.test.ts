import { describe, expect, it } from "vitest";
import { cabinetFrom, maskName, pickPatient } from "@/shared/domain/masking";

describe("маскирование ФИО (152-ФЗ)", () => {
  it("полное ФИО → Фамилия И. О.", () => {
    expect(maskName("Иванов иван Иванович")).toBe("Иванов И. И.");
  });
  it("уже замаскированное не меняется", () => {
    expect(maskName("Иванов И. И.")).toBe("Иванов И. И.");
  });
  it("пусто → пусто", () => {
    expect(maskName("  ")).toBe("");
  });
  it("из collected по отдельным полям", () => {
    expect(pickPatient({ "фамилия": "Петров", "имя": "Пётр", "отчество": "Петрович" })).toBe("Петров П. П.");
  });
  it("дата рождения в имя не попадает", () => {
    expect(pickPatient({ "фамилия": "Петров", "дата рождения": "01.01.1980" })).toBe("Петров");
  });
  it("кабинет из текста ответа", () => {
    expect(cabinetFrom("Ждём вас, кабинет № 214")).toBe("214");
    expect(cabinetFrom("Приём в кабинете А-12")).toBe("А-12");
    expect(cabinetFrom("без кабинета")).toBeNull();
  });
});
