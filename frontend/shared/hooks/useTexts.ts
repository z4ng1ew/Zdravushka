"use client";

// Тексты интерфейса для экранов: { texts, error }. Пока не загрузились — texts = null
// (приветствие и подсказки не показываются, остальное работает).

import { useEffect, useState } from "react";
import { toApiError, type ApiError } from "../api/ApiError";
import { loadTexts, subscribeTexts, textsNow } from "../store/uiTexts";
import type { UiTexts } from "../types/texts";

export function useTexts(): { texts: UiTexts | null; error: ApiError | null } {
  const [texts, setTexts] = useState<UiTexts | null>(textsNow);
  const [error, setError] = useState<ApiError | null>(null);
  useEffect(() => {
    let alive = true;
    const off = subscribeTexts(() => { if (alive) setTexts(textsNow()); });
    loadTexts()
      .then((t) => { if (alive) setTexts(t); })
      .catch((e) => { if (alive) setError(toApiError(e)); });
    return () => { alive = false; off(); };
  }, []);
  return { texts, error };
}

/** Имя ассистента с сервера; пока не пришло — нейтрально «ИИ-помощник» */
export function useAssistantName(): string {
  return useTexts().texts?.assistant_name || "ИИ-помощник";
}
