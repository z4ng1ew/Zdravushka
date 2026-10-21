"use client";

// Состояние сервера (GET /api/health) раз в 30 секунд (shared/config.ts) — для плашки режима МИС.

import { POLL } from "../config";
import { getHealth } from "../api/health";
import { misMode, type MisMode } from "../domain/misMode";
import type { Health } from "../types/chat";
import { usePolling } from "./usePolling";
import type { ApiError } from "../api/ApiError";

export interface HealthState { data: Health | null; mode: MisMode; error: ApiError | null }

export function useHealth(everyMs: number = POLL.health): HealthState {
  const { data, error } = usePolling(getHealth, everyMs);
  return { data, mode: misMode(data), error };
}
