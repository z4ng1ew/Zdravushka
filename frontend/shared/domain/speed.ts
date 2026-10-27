// Скорость ответа ассистента по полю timings звонков (GET /api/calls, /api/live) — чистые функции.
// timings — по записи на фразу пациента (только телефонные звонки):
//   stt_ms — распознавание речи, dialog_ms — понимание + МИС (без синтеза голоса),
//   stt / llm — какой источник ответил: organizers — шлюз организаторов, mac — наш сервер, null — LLM не понадобилась.

import type { LastAi } from "../types/providers";
import type { Call, PhraseTiming } from "../types/staff";
import { keyOf, splitDT } from "./dates";

const SOURCE_NAME: Record<string, string> = { organizers: "шлюз организаторов", mac: "наш сервер" };

/** Название источника по-русски; незнакомый — как прислал сервер */
export const sourceName = (s: string) => SOURCE_NAME[s] ?? s;

/** Секунды с одним знаком после запятой: 2140 → «2,1 с» */
export const secText = (ms: number) => `${(Math.round(ms / 100) / 10).toFixed(1).replace(".", ",")} с`;

/** Полное время ответа на фразу: распознавание + диалог */
export const phraseMs = (t: PhraseTiming) => t.stt_ms + t.dialog_ms;

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** Самый частый источник среди stt и llm; при равенстве — тот, что встретился раньше */
function topSource(timings: PhraseTiming[]): string | null {
  const count = new Map<string, number>();
  for (const t of timings) for (const s of [t.stt, t.llm]) if (s) count.set(s, (count.get(s) ?? 0) + 1);
  let best: string | null = null;
  for (const [s, n] of count) if (best === null || n > (count.get(best) ?? 0)) best = s;
  return best;
}

export interface SpeedSummary { avgMs: number; sttMs: number; dialogMs: number; source: string | null; text: string }

/** Строка под расшифровкой звонка; null — данных нет (старый звонок, звонок с сайта) */
export function speedSummary(timings: PhraseTiming[] | undefined): SpeedSummary | null {
  if (!timings?.length) return null;
  const avgMs = avg(timings.map(phraseMs));
  const sttMs = avg(timings.map((t) => t.stt_ms));
  const dialogMs = avg(timings.map((t) => t.dialog_ms));
  const source = topSource(timings);
  const parts = [`Скорость: в среднем ${secText(avgMs)} на фразу`, `распознавание ${secText(sttMs)}`, `диалог ${secText(dialogMs)}`];
  if (source) parts.push(`источник: ${sourceName(source)}`);
  return { avgMs, sttMs, dialogMs, source, text: parts.join(" · ") };
}

/** Медиана: один долгий ответ не искажает картину. Пусто — null */
export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Плитка «Ответ ассистента»: медиана по всем фразам сегодняшних звонков; null — данных нет */
export function daySpeed(calls: Call[], now = new Date()): { medianMs: number; phrases: number } | null {
  const today = keyOf(now);
  const all = calls.filter((c) => splitDT(c.started_at).date === today).flatMap((c) => (c.timings ?? []).map(phraseMs));
  const m = median(all);
  return m === null ? null : { medianMs: m, phrases: all.length };
}

/** Последний ответ ИИ (last_ai в /api/health): «распознавание 0,6 с (наш сервер) · LLM 1,1 с (наш сервер)»; нет — пусто */
export function lastAiText(a: LastAi | null | undefined): string {
  if (!a) return "";
  const part = (label: string, c: LastAi["stt"]) => (c ? `${label} ${secText(c.ms)} (${sourceName(c.provider)})` : "");
  return [part("распознавание", a.stt), part("LLM", a.llm)].filter(Boolean).join(" · ");
}
