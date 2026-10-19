"use client";

// Телефонные звонки, идущие сейчас (GET /api/live): опрос раз в 2 секунды, пока вкладка открыта.

import { getLiveCalls } from "@/shared/api/staff";
import { POLL } from "@/shared/config";
import { usePolling } from "@/shared/hooks/usePolling";

export function usePhoneCalls() {
  return usePolling(getLiveCalls, POLL.live);
}
