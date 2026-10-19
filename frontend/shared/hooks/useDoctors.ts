"use client";

// Справочник врачей для экранов: { doctors, loaded, error }. Пока не загрузился — пустой список.

import { useEffect, useState } from "react";
import { toApiError, type ApiError } from "../api/ApiError";
import { doctorsNow, loadDoctors } from "../store/doctorDirectory";
import type { Doctor } from "../types/doctor";

export function useDoctors(): { doctors: Doctor[]; loaded: boolean; error: ApiError | null } {
  const [doctors, setDoctors] = useState<Doctor[]>(doctorsNow);
  const [loaded, setLoaded] = useState(() => doctorsNow().length > 0);
  const [error, setError] = useState<ApiError | null>(null);
  useEffect(() => {
    let alive = true;
    loadDoctors()
      .then((d) => { if (alive) { setDoctors(d); setLoaded(true); } })
      .catch((e) => { if (alive) setError(toApiError(e)); });
    return () => { alive = false; };
  }, []);
  return { doctors, loaded, error };
}
