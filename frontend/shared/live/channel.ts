// Канал «живого» звонка между экраном пациента и кабинетом регистратора.
// Сейчас это BroadcastChannel (вкладки одного браузера). Когда у бэкенда появится WebSocket,
// меняется только этот файл — формат сообщений (shared/types/live.ts) тот же.

import { oneOf, textRecord } from "../api/parse";
import { STORAGE } from "../config";
import type { LiveCall, LiveLine, LiveMessage } from "../types/live";

export interface LiveChannel {
  send: (m: LiveMessage) => void;
  close: () => void;
}

const NAME = STORAGE.liveChannel;
const TYPES = new Set(["state", "hello", "takeover", "release", "operator_say"]);

/** Сообщение нашего формата (вкладка другой версии сайта может прислать что-то иное).
 *  Состояние — только с номером вкладки, команда — только с адресатом: иначе не поймём, чей это звонок */
function isMessage(v: unknown): v is LiveMessage {
  if (typeof v !== "object" || v === null) return false;
  const m = v as { type?: string; from?: unknown; to?: unknown };
  if (!TYPES.has(m.type ?? "")) return false;
  if (m.type === "state") return typeof m.from === "string" && m.from !== "";
  return m.type === "hello" || (typeof m.to === "string" && m.to !== "");
}

/** Номер вкладки пациента: свой у каждой, чтобы кабинет различал звонки */
export function newTabId(): string {
  const c = typeof crypto !== "undefined" ? crypto : undefined;
  return c?.randomUUID ? c.randomUUID() : `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** Команда кабинета адресована этой вкладке */
export const isForMe = (m: LiveMessage, me: string) => !("to" in m) || m.to === me;

const isLine = (l: unknown): l is LiveLine =>
  typeof l === "object" && l !== null && typeof (l as LiveLine).text === "string";

const PHASES = ["idle", "active", "ended"] as const;
const MODES = ["ai", "waiting", "operator"] as const;

/** Состояние звонка из сообщения: недостающее и чужое — пустым, чтобы экран «Звонок сейчас» не падал */
export function cleanLiveCall(raw: unknown): LiveCall {
  const c = (typeof raw === "object" && raw !== null ? raw : {}) as Partial<LiveCall>;
  return {
    phase: oneOf(c.phase, PHASES, "idle"), mode: oneOf(c.mode, MODES, "ai"),
    seconds: Number(c.seconds) || 0, intent: typeof c.intent === "string" ? c.intent : null,
    fields: textRecord(c.fields), lines: Array.isArray(c.lines) ? c.lines.filter(isLine) : [],
    operator: typeof c.operator === "string" ? c.operator : null,
  };
}

export function openLive(onMessage: (m: LiveMessage) => void): LiveChannel {
  if (typeof window === "undefined" || !("BroadcastChannel" in window)) {
    return { send: () => {}, close: () => {} };
  }
  const ch = new BroadcastChannel(NAME);
  let open = true;
  ch.onmessage = (e) => {
    if (!isMessage(e.data)) return;
    onMessage(e.data.type === "state" ? { type: "state", call: cleanLiveCall(e.data.call), from: e.data.from } : e.data);
  };
  return {
    send: (m) => { if (open) ch.postMessage(m); }, // после закрытия postMessage бросает исключение
    close: () => { open = false; ch.close(); },
  };
}
