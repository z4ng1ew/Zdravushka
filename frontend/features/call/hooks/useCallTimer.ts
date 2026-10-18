"use client";

// Таймер звонка: идёт, пока звонок активен; сбрасывается на каждом новом звонке (callNo).

import { useEffect, useState } from "react";
import type { CallPhase } from "@/shared/types/live";

export function useCallTimer(phase: CallPhase, callNo: number): number {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => setSeconds(0), [callNo]);
  useEffect(() => {
    if (phase !== "active") return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [phase]);
  return seconds;
}
