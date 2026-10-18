"use client";

// Действие по кнопке с состоянием «выполняется» и ошибкой — отдельно для каждого ключа
// (строка очереди, строка обзвона, «Обзвонить всех»), чтобы кнопки не мешали друг другу.

import { useCallback, useState } from "react";
import { toApiError, type ApiError } from "../api/ApiError";

export interface Actions {
  busy: (key: string) => boolean;
  error: (key: string) => ApiError | null;
  run: <T>(key: string, fn: () => Promise<T>, after?: (r: T) => void) => Promise<void>;
}

export function useAction(onDone?: () => void): Actions {
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, ApiError | null>>({});

  const run = useCallback(async <T,>(key: string, fn: () => Promise<T>, after?: (r: T) => void) => {
    setBusy((b) => ({ ...b, [key]: true }));
    setErrors((e) => ({ ...e, [key]: null }));
    try {
      after?.(await fn());
      onDone?.();
    } catch (e) {
      setErrors((x) => ({ ...x, [key]: toApiError(e) }));
    } finally {
      setBusy((b) => ({ ...b, [key]: false }));
    }
  }, [onDone]);

  return { busy: (k) => !!busy[k], error: (k) => errors[k] ?? null, run };
}
