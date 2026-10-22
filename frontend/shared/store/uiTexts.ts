// Тексты интерфейса с сервера, загруженные один раз за открытие страницы (как справочник врачей).
// Повторные вызовы отдают кэш; одновременные — ждут один и тот же запрос.
// subscribe — экраны перерисовываются, когда тексты пришли (useTexts).

import { getTexts } from "../api/texts";
import type { UiTexts } from "../types/texts";

let cache: UiTexts | null = null;
let loading: Promise<UiTexts> | null = null;
const listeners = new Set<() => void>();

export function loadTexts(): Promise<UiTexts> {
  if (cache) return Promise.resolve(cache);
  loading ??= getTexts()
    .then((t) => { cache = t; listeners.forEach((f) => f()); return t; })
    .finally(() => { loading = null; });
  return loading;
}

/** Уже загруженные тексты (null — ещё не пришли или сервер недоступен) */
export const textsNow = (): UiTexts | null => cache;

export function subscribeTexts(f: () => void): () => void {
  listeners.add(f);
  return () => { listeners.delete(f); };
}

/** Только для тестов: начать с чистого листа */
export function resetTextsForTests(t: UiTexts | null = null): void { cache = t; loading = null; }
