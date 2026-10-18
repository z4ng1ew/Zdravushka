"use client";

// Звуковой сигнал, когда в очереди появилась новая срочная заявка (после первой загрузки).

import { useEffect, useRef } from "react";
import { beep } from "@/shared/browser/beep";
import type { Handoff } from "@/shared/types/staff";

export function useUrgentBeep(handoffs: Handoff[] | null) {
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!handoffs) return;
    const urgent = handoffs.filter((h) => h.urgent && h.status === "новая").map((h) => h.id);
    if (seen.current && urgent.some((id) => !seen.current!.has(id))) beep();
    seen.current = new Set(urgent);
  }, [handoffs]);
}
