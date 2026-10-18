// Канал «живого» звонка между экраном пациента и кабинетом регистратора.
// Сейчас это BroadcastChannel (вкладки одного браузера). Когда у бэкенда появится WebSocket,
// меняется только этот файл — формат сообщений (shared/types/live.ts) тот же.

import { STORAGE } from "../config";
import type { LiveMessage } from "../types/live";

export interface LiveChannel {
  send: (m: LiveMessage) => void;
  close: () => void;
}

const NAME = STORAGE.liveChannel;

export function openLive(onMessage: (m: LiveMessage) => void): LiveChannel {
  if (typeof window === "undefined" || !("BroadcastChannel" in window)) {
    return { send: () => {}, close: () => {} };
  }
  const ch = new BroadcastChannel(NAME);
  ch.onmessage = (e) => onMessage(e.data as LiveMessage);
  return { send: (m) => ch.postMessage(m), close: () => ch.close() };
}
