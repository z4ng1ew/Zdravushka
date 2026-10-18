// Персональные данные (152-ФЗ): в браузере и в кабинете только «Фамилия И. О.».

/** Сравнение строк без учёта регистра, «ё» и лишних пробелов */
export const norm = (s: string) => s.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();

/** «Иванов Иван Иванович» → «Иванов И. И.» (уже замаскированное не меняется) */
export function maskName(full: string): string {
  const [last, ...rest] = full.trim().split(/\s+/).filter(Boolean);
  if (!last) return "";
  const initial = (p: string) => (p.endsWith(".") && p.length <= 2 ? p : `${p[0].toUpperCase()}.`);
  return [last, ...rest.map(initial)].join(" ");
}

/** Пациент из collected бэкенда («фамилия», «имя», «отчество» или «ФИО») — сразу в маскированном виде */
export function pickPatient(collected: Record<string, string>): string {
  const get = (re: RegExp) => Object.entries(collected).find(([k]) => re.test(k.toLowerCase()))?.[1];
  const fio = get(/фио|^пациент/);
  return maskName(fio ? String(fio) : [get(/^фамил/), get(/^имя/), get(/^отчеств/)].filter(Boolean).join(" "));
}

/** Кабинет из текста ответа бота: «…, кабинет 214», «кабинете № А-12». В номере обязательно есть цифра. */
export function cabinetFrom(text?: string | null): string | null {
  const m = text?.match(/кабинет[еау]?\s*№?\s*((?:[A-Za-zА-Яа-я]-?)?\d[0-9A-Za-zА-Яа-я-]*)/i);
  return m ? m[1] : null;
}
