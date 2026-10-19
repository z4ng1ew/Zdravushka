"use client";

// Кабинет: слушаем «живой» звонок пациента и управляем им (перехватить, вернуть ИИ, сказать фразу).
// Вкладка пациента шлёт состояние каждую секунду; если она пропала без «звонок завершён»
// (браузер закрылся), через STALE_MS считаем звонок завершённым.

import { useEffect, useRef, useState } from "react";
import { openLive, type LiveChannel } from "@/shared/live/channel";
import type { LiveCall } from "@/shared/types/live";

const OPERATOR = ""; // имя сотрудника появится, когда будет вход по учётной записи
export const GREETING = "Здравствуйте, регистратура. Слушаю вас.";
const STALE_MS = 90_000; // фоновая вкладка может присылать состояние раз в минуту — ждём с запасом

export function useLiveCall() {
  const [call, setCall] = useState<LiveCall | null>(null);
  const ch = useRef<LiveChannel | null>(null);
  const seen = useRef(0);
  const greet = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    ch.current = openLive((m) => { if (m.type === "state") { seen.current = Date.now(); setCall(m.call); } });
    ch.current.send({ type: "hello" }); // попросить текущее состояние, если звонок уже идёт
    const lost = setInterval(() => setCall((c) => (c?.phase === "active" && Date.now() - seen.current > STALE_MS
      ? { ...c, phase: "ended" } : c)), 5000);
    return () => { clearInterval(lost); clearTimeout(greet.current); ch.current?.close(); };
  }, []);

  const say = (text: string) => { if (text.trim()) ch.current?.send({ type: "operator_say", text: text.trim() }); };
  const takeover = () => {
    ch.current?.send({ type: "takeover", operator: OPERATOR });
    greet.current = setTimeout(() => say(GREETING), 300);
  };
  const release = () => ch.current?.send({ type: "release" });

  return { call, say, takeover, release };
}
