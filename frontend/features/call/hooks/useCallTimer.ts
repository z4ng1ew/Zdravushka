"use client";

// Таймер звонка: идёт, пока звонок активен; сбрасывается на каждом новом звонке (callNo).
// Считаем от времени начала, а не прибавляем по секунде: в фоновой вкладке браузер замедляет
// setInterval, и таймер иначе отставал бы. Перехват после завершения — счёт продолжается.

import { useEffect, useRef, useState } from "react";
import type { CallPhase } from "@/shared/types/live";

export function useCallTimer(phase: CallPhase, callNo: number): number {
  const [seconds, setSeconds] = useState(0);
  const last = useRef({ callNo, seconds: 0 });
  useEffect(() => {
    if (last.current.callNo !== callNo) { last.current = { callNo, seconds: 0 }; setSeconds(0); }
    if (phase !== "active") return;
    const startedAt = Date.now() - last.current.seconds * 1000;
    const t = setInterval(() => {
      last.current.seconds = Math.floor((Date.now() - startedAt) / 1000);
      setSeconds(last.current.seconds);
    }, 1000);
    return () => clearInterval(t);
  }, [phase, callNo]);
  return seconds;
}
