"use client";

// Опрос сервера: загрузить сразу, потом каждые everyMs (только когда вкладка видна).
// Один хук для всех экранов: панель регистратора, плашка МИС, страница ошибок.
// Запросы не наслаиваются: пока прошлый не ответил, новый не уходит (иначе при медленном сервере
// браузер копит очередь и запросы чата ждут); refresh() во время запроса — повторим сразу после него.

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
  const inFlight = useRef(false);
  const again = useRef(false);

  /** queue — ручное обновление: если запрос уже идёт, повторить сразу после него; тик таймера — пропустить */
  const run = useCallback((queue: boolean) => {
    if (inFlight.current) { if (queue) again.current = true; return; }
    inFlight.current = true;
    loadRef.current()
      .then((d) => { if (alive.current) { setData(d); setError(null); } })
      .catch((e) => { if (alive.current) setError(toApiError(e)); })
      .finally(() => {
        inFlight.current = false;
        if (again.current && alive.current) { again.current = false; run(false); }
      });
  }, []);
  const refresh = useCallback(() => run(true), [run]);

  useEffect(() => {
    alive.current = true;
    run(false);
    const visible = () => document.visibilityState === "visible";
    const t = setInterval(() => { if (visible()) run(false); }, everyMs);
    const onShow = () => { if (visible()) run(false); }; // вернулись на вкладку — сразу свежие данные
    document.addEventListener("visibilitychange", onShow);
    return () => { alive.current = false; clearInterval(t); document.removeEventListener("visibilitychange", onShow); };
  }, [run, everyMs]);

  return { data, error, refresh };
}
