// Очередь переводов — чистые правила: порядок строк и маскированный пациент.

import { parseDT } from "@/shared/domain/dates";
import { maskName, norm } from "@/shared/domain/masking";
import type { Handoff } from "@/shared/types/staff";

export type QueueSort = "urgent" | "new";

/** ФИО маскируем так же, как бэкенд в журнале звонков (152-ФЗ): «Иванов И. И.» */
export function handoffPatient(h: Handoff): string {
  const c = h.collected;
  return c["фамилия"] ? maskName([c["фамилия"], c["имя"], c["отчество"]].filter(Boolean).join(" ")) : "";
}

/** Срочные и новые — наверх (или просто сначала новые) */
export function sortQueue(list: Handoff[], sort: QueueSort, showClosed: boolean): Handoff[] {
  const time = (h: Handoff) => parseDT(h.created_at).getTime();
  const open = list.filter((h) => showClosed || h.status !== "закрыта");
  return [...open].sort((a, b) => sort === "urgent"
    ? Number(b.urgent) - Number(a.urgent) || Number(a.status !== "новая") - Number(b.status !== "новая") || time(b) - time(a)
    : time(b) - time(a));
}

/** Поиск по очереди: пациент, причина, резюме, телефон, статус, что успел узнать ассистент */
export function matchHandoff(h: Handoff, q: string): boolean {
  const n = norm(q);
  if (!n) return true;
  return [handoffPatient(h), h.reason, h.summary, h.phone, h.status, ...Object.values(h.collected)]
    .some((v) => norm(v).includes(n));
}
