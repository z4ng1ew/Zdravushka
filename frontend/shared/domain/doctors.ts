// Справочник врачей для фронта — снимок data/schedule.json бэкенда Здравушки
// (ФИО, специальность, кабинет, длительность приёма, недельный график).
// id совпадает с doctor_id в ответах /api/chat (D001 → 1).
// Обновить снимок: scripts/sync-doctors.mjs ../data/schedule.json

import { keyOf } from "./dates";
import RAW from "./doctors.data.json";

export interface Doctor {
  id: number;
  fullName: string;
  specialty: string;
  department?: string;
  patients?: string;
  cabinet: string;
  slotMin?: number;
  weekly?: Record<string, string>; // «Пн» → «08:00–14:00» или «09:00–13:00, 14:00–18:00»
}

export const DOCTORS: Doctor[] = RAW as unknown as Doctor[];

const HOLIDAYS = new Set(["04.11.2026", "31.12.2026", "01.01.2027"]);
const WD = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

export const slotMinutes = (d: Doctor) => d.slotMin ?? 20;

/** «Смирнова Елена Викторовна» → «Смирнова Е. В.» */
export function shortName(full: string): string {
  const [f, i, o] = full.trim().split(/\s+/);
  return [f, i ? `${i[0]}.` : "", o ? `${o[0]}.` : ""].filter(Boolean).join(" ");
}

/** «терапевт» → «Врач-терапевт» */
export const specialtyTitle = (s: string) => (s.toLowerCase().startsWith("врач") ? s : `Врач-${s.toLowerCase()}`);

const norm = (s: string) => s.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();

export function findDoctor(name?: string | null, id?: number | null, cabinet?: string | null): Doctor {
  const byName = name ? DOCTORS.find((d) => norm(d.fullName) === norm(name)) : undefined;
  const byId = id != null ? DOCTORS.find((d) => d.id === id) : undefined;
  const doc = byName ?? byId;
  if (doc) return cabinet ? { ...doc, cabinet } : doc;
  return { id: id ?? -1, fullName: name ?? "Врач", specialty: "Врач", cabinet: cabinet ?? "—" };
}

/** Часы приёма в этот день («08:00–14:00») или null — выходной. */
export function workingHours(d: Doctor, day: Date): string | null {
  if (HOLIDAYS.has(keyOf(day))) return null;
  return d.weekly?.[WD[day.getDay()]] ?? null;
}

const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
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
    for (let m = toMin(a); m + step <= toMin(b); m += step) out.push(toHm(m));
  }
  return out;
}

/** Специальности по алфавиту */
export const SPECIALTIES = Array.from(new Set(DOCTORS.map((d) => d.specialty))).sort((a, b) => a.localeCompare(b, "ru"));
