// Правила по врачам (чистые функции): поиск в справочнике, часы приёма, слоты, подписи.
// Сам справочник приходит с сервера (shared/store/doctorDirectory.ts → GET /api/doctors).

import type { Doctor } from "../types/doctor";
import { keyOf, WD } from "./dates";

export type { Doctor };

const HOLIDAYS = new Set(["04.11.2026", "31.12.2026", "01.01.2027"]);
const DEFAULT_SLOT_MIN = 20;
const MAX_SLOTS = 200; // предохранитель: кривой график не должен повесить страницу

/** Длительность приёма; 0, отрицательное или мусор с сервера — 20 минут (иначе сетка зациклится) */
export const slotMinutes = (d: Doctor) =>
  d.slotMin !== undefined && Number.isFinite(d.slotMin) && d.slotMin >= 5 ? d.slotMin : DEFAULT_SLOT_MIN;

/** «Смирнова Елена Викторовна» → «Смирнова Е. В.» */
export function shortName(full: string): string {
  const [f, i, o] = full.trim().split(/\s+/);
  return [f, i ? `${i[0]}.` : "", o ? `${o[0]}.` : ""].filter(Boolean).join(" ");
}

/** «терапевт» → «Врач-терапевт» */
export const specialtyTitle = (s: string) => (s.toLowerCase().startsWith("врач") ? s : `Врач-${s.toLowerCase()}`);

const norm = (s: string) => s.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();

export interface DoctorQuery { name?: string | null; id?: number | null; cabinet?: string | null }

/** Врач из справочника по ФИО или id; не нашли (справочник не загружен) — запись «Врач» с кабинетом из ответа */
export function findDoctor(list: Doctor[], { name, id, cabinet }: DoctorQuery): Doctor {
  const byName = name ? list.find((d) => norm(d.fullName) === norm(name)) : undefined;
  const byId = id != null ? list.find((d) => d.id === id) : undefined;
  const doc = byName ?? byId;
  if (doc) return cabinet ? { ...doc, cabinet } : doc;
  return { id: id ?? -1, fullName: name ?? "Врач", specialty: "Врач", cabinet: cabinet ?? "—" };
}

/** Часы приёма в этот день («08:00–14:00») или null — выходной. */
export function workingHours(d: Doctor, day: Date): string | null {
  if (HOLIDAYS.has(keyOf(day))) return null;
  return d.weekly?.[WD[day.getDay()]] ?? null;
}

const toMin = (t: string) => { const [h, m] = t.trim().split(":").map(Number); return h * 60 + (m || 0); };
const toHm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** Слоты приёма «ЧЧ:ММ» на день по графику (занятость знает только МИС). */
export function daySlots(d: Doctor, day: Date): string[] {
  const h = workingHours(d, day);
  if (!h) return [];
  const step = slotMinutes(d);
  const out: string[] = [];
  for (const part of h.split(",")) {
    const [a, b] = part.trim().split(/[–-]/);
    if (!a || !b) continue;
    for (let m = toMin(a); m + step <= toMin(b) && out.length < MAX_SLOTS; m += step) out.push(toHm(m));
  }
  return out;
}

/** Специальности по алфавиту */
export const specialtiesOf = (list: Doctor[]) =>
  Array.from(new Set(list.map((d) => d.specialty))).sort((a, b) => a.localeCompare(b, "ru"));
