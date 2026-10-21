"use client";

// Связь экрана пациента с кабинетом регистратора: отправляем состояние звонка,
// принимаем «перехватить», «вернуть ИИ» и реплики регистратора — только адресованные этой вкладке
// (пациентов может быть несколько: у каждой вкладки свой номер).

import { useEffect, useRef } from "react";
import { isForMe, newTabId, openLive, type LiveChannel } from "@/shared/live/channel";
import type { LiveCall } from "@/shared/types/live";

export interface LiveHandlers {
  onTakeover: (operator: string) => void;
  onRelease: () => void;
  onOperatorSay: (text: string) => void;
}

export function useLiveBridge(call: LiveCall, handlers: LiveHandlers) {
  const channel = useRef<LiveChannel | null>(null);
  const me = useRef("");
  if (!me.current) me.current = newTabId();
  const snapshot = useRef(call);
  snapshot.current = call;
  const h = useRef(handlers);
  h.current = handlers;

  useEffect(() => {
    const from = me.current;
    const ch = openLive((m) => {
      if (!isForMe(m, from)) return; // команда другому пациенту
      if (m.type === "hello") ch.send({ type: "state", call: snapshot.current, from }); // регистратор открыл вкладку
      if (m.type === "takeover") h.current.onTakeover(m.operator);
      if (m.type === "release") h.current.onRelease();
      if (m.type === "operator_say") h.current.onOperatorSay(m.text);
    });
    channel.current = ch;
    // вкладку пациента закрыли или ушли со страницы — кабинет не должен показывать «идёт звонок» вечно
    const bye = () => {
      if (snapshot.current.phase === "active") ch.send({ type: "state", call: { ...snapshot.current, phase: "ended" }, from });
    };
    window.addEventListener("pagehide", bye);
    return () => { window.removeEventListener("pagehide", bye); bye(); ch.close(); };
  }, []);

  useEffect(() => {
    channel.current?.send({ type: "state", call, from: me.current });
  }, [call]);
}
