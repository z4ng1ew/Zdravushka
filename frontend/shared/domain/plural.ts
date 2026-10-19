// Русские окончания после числа: 1 поле, 2 поля, 5 полей; 21 поле, 11 полей.

/** forms — [один, два-четыре, пять и больше]: ["поле", "поля", "полей"] */
export function plural(n: number, [one, few, many]: readonly [string, string, string]): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b === 1) return one;
  if (b >= 2 && b <= 4) return few;
  return many;
}

/** «3 поля» */
export const countText = (n: number, forms: readonly [string, string, string]) => `${n} ${plural(n, forms)}`;
