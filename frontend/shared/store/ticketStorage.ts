"use client";

// Хранение талонов в браузере (localStorage) и хук с автообновлением между вкладками.
// 152-ФЗ: полное ФИО и дату рождения не храним; талоны старше 30 дней после приёма удаляются сами.

import { POLL, STORAGE, TICKET_RETENTION_MS } from "../config";
import { useEffect, useState } from "react";
import { parseDT } from "../domain/dates";
import { maskName } from "../domain/masking";
import type { Ticket, TicketsData } from "../types/ticket";

const KEY = STORAGE.tickets;
const EVT = STORAGE.tickets; // событие «талоны изменились» в этой же вкладке

const empty = (): TicketsData => ({ v: 1, tickets: [], seq: {} });

/** Старые версии могли хранить полное ФИО и дату рождения — маскируем и удаляем */
const migrate = ({ birth: _b, ...t }: Ticket & { birth?: string }): Ticket => ({ ...t, patient: maskName(t.patient ?? "") });
const STATUSES = new Set(["Запланирована", "Отменена", "Завершена", "Неявка"]);
/** Испорченную или чужую запись в хранилище пропускаем, чтобы она не ломала экран */
const valid = (t: Partial<Ticket> | null): t is Ticket => !!t && typeof t.number === "string"
  && typeof t.scheduledAt === "string" && STATUSES.has(t.status ?? "") && Array.isArray(t.history);
const fresh = (t: Ticket) => Date.now() - parseDT(t.scheduledAt).getTime() < TICKET_RETENTION_MS;

export function loadTickets(): TicketsData {
  if (typeof window === "undefined") return empty();
  try {
    const d = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (!d || d.v !== 1) return empty();
    return { v: 1, tickets: (Array.isArray(d.tickets) ? d.tickets : []).filter(valid).filter(fresh).map(migrate), seq: d.seq ?? {} };
  } catch {
    return empty();
  }
}

function save(d: TicketsData) {
  try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* хранилище недоступно */ }
  window.dispatchEvent(new Event(EVT));
}

/** Изменить данные и сохранить (одно место записи) */
export function mutateTickets<T>(fn: (d: TicketsData) => T): T {
  const d = loadTickets();
  const r = fn(d);
  save(d);
  return r;
}

export const clearTickets = () => save(empty());

/** Талоны с автообновлением (другие вкладки и раз в 20 с) */
export function useTickets(): TicketsData {
  const [d, setD] = useState<TicketsData>(empty);
  useEffect(() => {
    const f = () => setD(loadTickets());
    f();
    window.addEventListener("storage", f);
    window.addEventListener(EVT, f);
    const t = setInterval(f, POLL.tickets);
    return () => { window.removeEventListener("storage", f); window.removeEventListener(EVT, f); clearInterval(t); };
  }, []);
  return d;
}
