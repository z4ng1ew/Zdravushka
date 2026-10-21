// Даты в формате МИС: «ДД.ММ.ГГГГ» и «ДД.ММ.ГГГГ ЧЧ:ММ».

export const pad = (n: number) => String(n).padStart(2, "0");

export const keyOf = (d: Date) => `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;

export function parseKey(k: string): Date {
  const [dd, mm, yy] = k.split(".").map(Number);
  return new Date(yy || 1970, (mm || 1) - 1, dd || 1);
}

export function splitDT(s: string): { date: string; time: string } {
  const [date = "", time = ""] = (s || "").trim().split(/\s+/);
  return { date, time };
}

export function parseDT(s: string): Date {
  const { date, time } = splitDT(s);
  const d = parseKey(date);
  const [h, m] = time.split(":").map(Number);
  d.setHours(h || 0, m || 0, 0, 0);
  return d;
}

export const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

export const todayKey = () => keyOf(new Date());
const tomorrowKey = () => keyOf(addDays(new Date(), 1));

export const WD = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа",
  "сентября", "октября", "ноября", "декабря"];

/** «Чт, 15 октября» */
export function humanDay(d: Date): string {
  return `${WD[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** «завтра, чт, 15 октября» и т. п. */
export function relDay(key: string): string {
  const d = parseKey(key);
  if (key === todayKey()) return `сегодня, ${humanDay(d).toLowerCase()}`;
  if (key === tomorrowKey()) return `завтра, ${humanDay(d).toLowerCase()}`;
  return humanDay(d);
}

/** Текущее время «ЧЧ:ММ» для ленты разговора */
export const nowHM = () => new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });

/** Секунды → «ЧЧ:ММ:СС» (таймер звонка) */
export const hms = (s: number) => [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map(pad).join(":");

/** «N мин назад» по дате в формате МИС «ДД.ММ.ГГГГ ЧЧ:ММ» */
export function agoMis(at: string): string {
  const m = Math.max(0, Math.round((Date.now() - parseDT(at).getTime()) / 60000));
  if (m < 1) return "только что";
  if (m < 60) return `${m} мин назад`;
  if (m < 1440) return `${Math.floor(m / 60)} ч назад`;
  return splitDT(at).date;
}

/** Длительность звонка: «45 с», «2 мин 5 с» (дробные и отрицательные секунды сервера — округляем) */
export function durationText(n: number): string {
  const s = Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
  return s >= 60 ? `${Math.floor(s / 60)} мин ${s % 60} с` : `${s} с`;
}
