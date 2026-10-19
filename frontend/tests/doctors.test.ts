import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { findDoctor, specialtiesOf } from "@/shared/domain/doctors";

const list = [
  { id: 1, fullName: "Верещагин Андрей Михайлович", specialty: "Терапевт", cabinet: "101", weekly: {} },
  { id: 2, fullName: "Смирнова Елена Викторовна", specialty: "Кардиолог", cabinet: "205", weekly: {} },
];
const ok = (body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }));

beforeEach(() => { vi.resetModules(); vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} }); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("loadDoctors — справочник с сервера (GET /api/doctors)", () => {
  it("грузит один раз и дальше отдаёт кэш", async () => {
    const fetchMock = ok(list);
    vi.stubGlobal("fetch", fetchMock);
    const { loadDoctors, doctorsNow } = await import("@/shared/store/doctorDirectory");
    expect(await loadDoctors()).toHaveLength(2);
    await loadDoctors();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(doctorsNow()[0].cabinet).toBe("101");
  });
  it("одновременные вызовы — один запрос", async () => {
    const fetchMock = ok(list);
    vi.stubGlobal("fetch", fetchMock);
    const { loadDoctors } = await import("@/shared/store/doctorDirectory");
    await Promise.all([loadDoctors(), loadDoctors(), loadDoctors()]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("ошибка сервера — пробуем снова при следующем вызове", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 404 })));
    const { loadDoctors } = await import("@/shared/store/doctorDirectory");
    await expect(loadDoctors()).rejects.toMatchObject({ status: 404 });
    vi.stubGlobal("fetch", ok(list));
    expect(await loadDoctors()).toHaveLength(2);
  });
});

describe("findDoctor / specialtiesOf", () => {
  it("по ФИО без учёта регистра и «ё»; кабинет из ответа бота важнее справочника", () => {
    expect(findDoctor(list, { name: "смирнова елена викторовна", cabinet: "310" })).toMatchObject({ id: 2, cabinet: "310" });
  });
  it("по id", () => {
    expect(findDoctor(list, { id: 1 }).fullName).toBe("Верещагин Андрей Михайлович");
  });
  it("справочник ещё не загружен — запись «Врач» с данными из ответа", () => {
    expect(findDoctor([], { name: "Петров П. П.", cabinet: "12" })).toMatchObject({ fullName: "Петров П. П.", specialty: "Врач", cabinet: "12" });
  });
  it("специальности по алфавиту без повторов", () => {
    expect(specialtiesOf([...list, list[0]])).toEqual(["Кардиолог", "Терапевт"]);
  });
});
