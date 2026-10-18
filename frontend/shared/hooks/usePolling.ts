"use client";

// Опрос сервера: загрузить сразу, потом каждые everyMs (только когда вкладка видна).
// Один хук для всех экранов: панель регистратора, плашка МИС, страница ошибок.

import { useCallback, useEffect, useRef, useState } from "react";
import { toApiError, type ApiError } from "../api/ApiError";

export interface Polled<T> {
  data: T | null; // null — ещё не загружено
  error: ApiError | null;
  refresh: () => void; // перечитать сейчас (после действия пользователя)
}

export function usePolling<T>(load: () => Promise<T>, everyMs: number): Polled<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const loadRef = useRef(load);
  loadRef.current = load;
  const alive = useRef(true);

  const refresh = useCallback(() => {
    loadRef.current()
      .then((d) => { if (alive.current) { setData(d); setError(null); } })
      .catch((e) => { if (alive.current) setError(toApiError(e)); });
  }, []);

  useEffect(() => {
    alive.current = true;
    refresh();
    const t = setInterval(() => { if (document.visibilityState === "visible") refresh(); }, everyMs);
    return () => { alive.current = false; clearInterval(t); };
  }, [refresh, everyMs]);

  return { data, error, refresh };
}
