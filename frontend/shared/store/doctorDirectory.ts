// Справочник врачей с сервера, загруженный один раз за сессию страницы.
// Повторные вызовы отдают кэш; одновременные — ждут один и тот же запрос.

import { getDoctors } from "../api/doctors";
import type { Doctor } from "../types/doctor";

let cache: Doctor[] = [];
let loading: Promise<Doctor[]> | null = null;

export function loadDoctors(): Promise<Doctor[]> {
  if (cache.length) return Promise.resolve(cache);
  loading ??= getDoctors()
    .then((list) => (cache = Array.isArray(list) ? list : []))
    .finally(() => { loading = null; });
  return loading;
}

/** Уже загруженный список (пустой, пока не загрузили) */
export const doctorsNow = (): Doctor[] => cache;
