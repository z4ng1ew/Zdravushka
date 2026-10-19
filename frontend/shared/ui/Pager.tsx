// Переключатель страниц под списком: «1–10 из 49», ‹ назад, вперёд ›. Одна страница — не показываем.

import type { Page } from "@/shared/domain/paging";
import { IChevron } from "./NavIcons";

export default function Pager<T>({ page, onPage }: { page: Page<T>; onPage: (p: number) => void }) {
  if (page.pages <= 1) return null;
  return (
    <nav className="pager" aria-label="Страницы списка">
      <span className="pager-info">{page.from}–{page.to} из {page.total}</span>
      <button type="button" className="pager-btn pager-prev" onClick={() => onPage(page.page - 1)} disabled={page.page <= 1}
        aria-label="Предыдущая страница"><IChevron /></button>
      <span className="pager-now" aria-current="page">{page.page} / {page.pages}</span>
      <button type="button" className="pager-btn pager-next" onClick={() => onPage(page.page + 1)} disabled={page.page >= page.pages}
        aria-label="Следующая страница"><IChevron /></button>
    </nav>
  );
}
