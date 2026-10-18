"use client";

// Кабинет: слушаем «живой» звонок пациента и управляем им (перехватить, вернуть ИИ, сказать фразу).

import { useEffect, useRef, useState } from "react";
import { openLive, type LiveChannel } from "@/shared/live/channel";
import type { LiveCall } from "@/shared/types/live";

const OPERATOR = ""; // имя сотрудника появится, когда будет вход по учётной записи
export const GREETING = "Здравствуйте, регистратура. Слушаю вас.";

export function useLiveCall() {
  const [call, setCall] = useState<LiveCall | null>(null);
  const ch = useRef<LiveChannel | null>(null);

  useEffect(() => {
    ch.current = openLive((m) => { if (m.type === "state") setCall(m.call); });
    ch.current.send({ type: "hello" }); // попросить текущее состояние, если звонок уже идёт
    return () => ch.current?.close();
  }, []);

  const say = (text: string) => { if (text.trim()) ch.current?.send({ type: "operator_say", text: text.trim() }); };
  const takeover = () => {
    ch.current?.send({ type: "takeover", operator: OPERATOR });
    setTimeout(() => say(GREETING), 300);
  };
  const release = () => ch.current?.send({ type: "release" });

  return { call, say, takeover, release };
}
