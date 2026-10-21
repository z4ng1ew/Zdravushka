"use client";

// Кабинет: слушаем «живые» звонки пациентов из вкладок этого браузера и управляем каждым
// (перехватить, вернуть ИИ, сказать фразу) — команда уходит только в вкладку этого пациента.
// Вкладка пациента шлёт состояние при каждом изменении; если она пропала без «звонок завершён»
// (браузер закрылся), через STALE_MS считаем звонок завершённым; завершённый убираем через DROP_MS.

import { useCallback, useEffect, useRef, useState } from "react";
import { openLive, type LiveChannel } from "@/shared/live/channel";
import type { LiveCall } from "@/shared/types/live";

const OPERATOR = ""; // имя сотрудника появится, когда будет вход по учётной записи
export const GREETING = "Здравствуйте, регистратура. Слушаю вас.";
const STALE_MS = 90_000; // фоновая вкладка может присылать состояние раз в минуту — ждём с запасом
const DROP_MS = 120_000; // завершённый звонок висит ещё 2 минуты, потом убираем

export interface WebLiveCall { id: string; call: LiveCall; seen: number; first: number }

/** Новое состояние вкладки. Порядок карточек — по началу звонка (first = сейчас − длительность):
 *  № 1 — кто позвонил раньше; при обновлениях карточки не прыгают */
export function upsertCall(list: WebLiveCall[], id: string, call: LiveCall, now: number): WebLiveCall[] {
  if (call.phase === "idle") return list.filter((c) => c.id !== id);
  const old = list.find((c) => c.id === id);
  if (old) return list.map((c) => (c.id === id ? { ...c, call, seen: now } : c));
  const added = [...list, { id, call, seen: now, first: now - call.seconds * 1000 }];
  return added.sort((x, y) => x.first - y.first);
}

/** Пропавшие вкладки — «завершён», давно завершённые — убрать */
export function sweepCalls(list: WebLiveCall[], now: number): WebLiveCall[] {
  const next = list
    .map((c) => (c.call.phase === "active" && now - c.seen > STALE_MS ? { ...c, call: { ...c.call, phase: "ended" as const }, seen: now } : c))
    .filter((c) => !(c.call.phase === "ended" && now - c.seen > DROP_MS));
  const same = next.length === list.length && next.every((c, i) => c === list[i]);
  return same ? list : next;
}

export function useLiveCall() {
  const [calls, setCalls] = useState<WebLiveCall[]>([]);
  const ch = useRef<LiveChannel | null>(null);
  const greet = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const timers = greet.current;
    ch.current = openLive((m) => { if (m.type === "state") setCalls((l) => upsertCall(l, m.from, m.call, Date.now())); });
    ch.current.send({ type: "hello" }); // попросить текущее состояние у всех открытых вкладок пациентов
    const lost = setInterval(() => setCalls((l) => sweepCalls(l, Date.now())), 5000);
    return () => { clearInterval(lost); timers.forEach(clearTimeout); ch.current?.close(); };
  }, []);

  const say = useCallback((to: string, text: string) => {
    if (text.trim()) ch.current?.send({ type: "operator_say", text: text.trim(), to });
  }, []);
  const takeover = useCallback((to: string) => {
    if (greet.current.has(to)) return; // двойной клик — одно приветствие
    ch.current?.send({ type: "takeover", operator: OPERATOR, to });
    greet.current.set(to, setTimeout(() => { greet.current.delete(to); say(to, GREETING); }, 300));
  }, [say]);
  const release = useCallback((to: string) => ch.current?.send({ type: "release", to }), []);

  return { calls, say, takeover, release };
}
