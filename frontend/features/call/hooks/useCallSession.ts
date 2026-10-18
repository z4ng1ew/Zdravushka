"use client";

// Разговор со Здравушкой через POST /api/chat: начать звонок, сказать фразу, выбрать вариант,
// позвать регистратора. Состояние — в callReducer, побочные эффекты (сеть, талоны) — здесь.

import { useCallback, useMemo, useReducer, useRef } from "react";
import { sendChat } from "@/shared/api/chat";
import { toApiError } from "@/shared/api/ApiError";
import { toUiBooking } from "@/shared/domain/booking";
import type { MisMode } from "@/shared/domain/misMode";
import { replyTags } from "@/shared/domain/replyTags";
import { issueTicket } from "@/shared/store/ticketActions";
import type { ChatResponse } from "@/shared/types/chat";
import type { Speaker } from "@/shared/types/staff";
import { callReducer, initialCall, type CallState } from "../model/callState";

const REGISTRAR_PHRASE = "Соедините меня с регистратором";

export function useCallSession(mis: MisMode) {
  const [state, dispatch] = useReducer(callReducer, initialCall);
  const ref = useRef<CallState>(state); // актуальное состояние для асинхронных шагов
  ref.current = state;
  const session = useRef<string | null>(null);
  const misRef = useRef(mis);
  misRef.current = mis;

  const line = useCallback((speaker: Speaker, text: string, confidence?: number) =>
    dispatch({ type: "line", line: { speaker, text, confidence } }), []);
  const notice = useCallback((text: string) => dispatch({ type: "notice", text }), []);
  const showError = useCallback((e: unknown) => dispatch({ type: "error", error: toApiError(e) }), []);

  /** Отправить текст боту и применить ответ. null — ошибка (уже показана в ленте) */
  const send = useCallback(async (text: string): Promise<ChatResponse | null> => {
    dispatch({ type: "sending", value: true });
    try {
      const r = await sendChat(session.current, text);
      session.current = r.session_id || session.current;
      const booking = r.booking ? toUiBooking(r.booking, r.intent, misRef.current) : null;
      dispatch({ type: "reply", r, tags: replyTags(r, misRef.current), booking, ticket: issueTicket(r) });
      return r;
    } catch (e) {
      showError(e);
      return null;
    } finally {
      dispatch({ type: "sending", value: false });
    }
  }, [showError]);

  /** Пациент сказал фразу (текстом или голосом) */
  const ask = useCallback(async (text: string, shown = text, confidence?: number) => {
    line("patient", shown, confidence);
    dispatch({ type: "clearOptions" });
    return send(text);
  }, [line, send]);

  /** Новый звонок: приветствие (пустой текст) и, если есть, первая фраза пациента */
  const start = useCallback(async (first?: string): Promise<ChatResponse | null> => {
    session.current = null;
    dispatch({ type: "reset" });
    const hello = await send("");
    if (!hello) { dispatch({ type: "phase", phase: "ended" }); return null; }
    return first ? ask(first) : hello;
  }, [send, ask]);

  const choose = useCallback((i: number) => {
    const o = ref.current.options[i];
    return ask(String(i + 1), o?.spoken ? `${i + 1} — ${o.spoken}` : String(i + 1));
  }, [ask]);

  /** «Регистратор»: перевод через бэкенд — он сам заводит обращение в очереди (GET /api/handoffs) */
  const toRegistrar = useCallback(async () => {
    if (ref.current.phase !== "active") return start(REGISTRAR_PHRASE);
    const r = await ask(REGISTRAR_PHRASE);
    if (!r?.escalation) { // сервер не перевёл (нет связи) — всё равно ждём человека из кабинета
      dispatch({ type: "mode", mode: "waiting" });
      line("bot", "Соединяю вас с регистратором, оставайтесь на линии.");
    }
    return r;
  }, [start, ask, line]);

  const actions = useMemo(() => ({
    end: () => dispatch({ type: "phase", phase: "ended" }),
    takeover: (operator: string) => { dispatch({ type: "phase", phase: "active" }); dispatch({ type: "mode", mode: "operator", operator }); },
    release: () => { dispatch({ type: "mode", mode: "ai", operator: null }); line("bot", "Я снова с вами. Чем ещё могу помочь?"); },
  }), [line]);

  return { state, ref, line, notice, showError, send, ask, start, choose, toRegistrar, ...actions };
}

export type CallSession = ReturnType<typeof useCallSession>;
