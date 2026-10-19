"use client";

// Страница длинного списка: номер страницы сбрасывается на первую, когда меняются поиск или фильтр (resetKey).

import { useEffect, useMemo, useState } from "react";
import { pageOf, type Page } from "../domain/paging";

export function useListPage<T>(list: T[], size: number, resetKey: string): { view: Page<T>; setPage: (p: number) => void } {
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [resetKey]);
  const view = useMemo(() => pageOf(list, page, size), [list, page, size]);
  return { view, setPage };
}
