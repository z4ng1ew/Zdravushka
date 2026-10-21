// Числа для дашборда в русском формате: «20,7%», «17 772», «3,5».

export const pct = (x: number) => `${(x * 100).toFixed(1).replace(".", ",")}%`;
export const num = (x: number, digits = 0) => x.toLocaleString("ru-RU", { maximumFractionDigits: digits });
export const dec = (x: number) => num(x, 1).replace(".", ",");
/** Доля a из b в процентах или «—», если b = 0 */
export const share = (a: number, b: number) => (b ? pct(a / b) : "—");
