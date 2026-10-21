// Постраничный вывод длинных списков (очередь переводов, журнал звонков) — чистая функция.

export interface Page<T> {
  items: T[];
  page: number; // 1…pages (номер исправлен, если список стал короче)
  pages: number;
  from: number; // номер первой строки на странице (с 1), 0 — пусто
  to: number;
  total: number;
}

export function pageOf<T>(list: T[], page: number, size: number): Page<T> {
  const per = Math.max(1, Math.floor(size));
  const pages = Math.max(1, Math.ceil(list.length / per));
  const p = Math.min(Math.max(1, Math.floor(page) || 1), pages);
  const start = (p - 1) * per;
  const items = list.slice(start, start + per);
  return { items, page: p, pages, from: items.length ? start + 1 : 0, to: start + items.length, total: list.length };
}
