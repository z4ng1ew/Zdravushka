"use client";

// Разговор со Здравушкой через POST /api/chat: начать звонок, сказать фразу, выбрать вариант,
// позвать регистратора. Состояние — в callReducer, отправка и номер звонка — в useChatSender.

import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import { toApiError } from "@/shared/api/ApiError";
import type { MisMode } from "@/shared/domain/misMode";
import { loadDoctors } from "@/shared/store/doctorDirectory";
import type { ChatResponse } from "@/shared/types/chat";
import type { Speaker } from "@/shared/types/staff";
import { callReducer, initialCall, type CallState } from "../model/callState";
import { useChatSender } from "./useChatSender";

const REGISTRAR_PHRASE = "Соедините меня с регистратором";
const NO_REGISTRAR = "Не получилось передать звонок регистратору: нет связи с сервером. "
  + "Нажмите «Отправить ещё раз» или позвоните в регистратуру.";

export function useCallSession(mis: MisMode) {
  const [state, dispatch] = useReducer(callReducer, initialCall);
  const ref = useRef<CallState>(state); // актуальное состояние для асинхронных шагов
  ref.current = state;
  const chat = useChatSender(dispatch, mis);
  const { send } = chat;
  // справочник врачей заранее — чтобы в талоне сразу были специальность и кабинет (ошибка уже в журнале)
  useEffect(() => { loadDoctors().catch(() => {}); }, []);

  const line = useCallback((speaker: Speaker, text: string, confidence?: number) =>
    dispatch({ type: "line", line: { speaker, text, confidence } }), []);
  const notice = useCallback((text: string) => dispatch({ type: "notice", text }), []);
  const showError = useCallback((e: unknown) => dispatch({ type: "error", error: toApiError(e) }), []);

  /** Пациент сказал фразу (текстом или голосом) */
  const ask = useCallback(async (text: string, shown = text, confidence?: number) => {
    line("patient", shown, confidence);
    dispatch({ type: "clearOptions" });
    return send(text, confidence);
  }, [line, send]);

  /** Новый звонок: приветствие (пустой текст) и, если есть, первая фраза пациента */
  const start = useCallback(async (first?: string): Promise<ChatResponse | null> => {
    const my = chat.newCall();
    dispatch({ type: "reset" });
    const hello = await send("");
    if (!chat.isCurrent(my)) return null;
    if (!hello) { dispatch({ type: "phase", phase: "ended" }); return null; }
    return first ? ask(first) : hello;
  }, [chat, send, ask]);

  const choose = useCallback((i: number) => {
    const o = ref.current.options[i];
    return ask(String(i + 1), o?.spoken ? `${i + 1} — ${o.spoken}` : String(i + 1));
  }, [ask]);

  /** «Регистратор»: перевод через бэкенд — он сам заводит обращение в очереди (GET /api/handoffs) */
  const toRegistrar = useCallback(async () => {
    if (ref.current.phase !== "active") return start(REGISTRAR_PHRASE);
    const my = chat.current();
    const r = await ask(REGISTRAR_PHRASE);
    if (!chat.isCurrent(my)) return null;
    if (!r) { dispatch({ type: "notice", text: NO_REGISTRAR }); return null; } // заявка не создана — не обещаем
    if (!r.escalation) { // сервер ответил, но не перевёл — ждём человека из кабинета («Звонок сейчас»)
      dispatch({ type: "mode", mode: "waiting" });
      line("bot", "Соединяю вас с регистратором, оставайтесь на линии.");
    }
    return r;
  }, [chat, start, ask, line]);

  const actions = useMemo(() => ({
    end: () => { chat.closeCall(); dispatch({ type: "phase", phase: "ended" }); dispatch({ type: "sending", value: false }); },
    takeover: (operator: string) => { dispatch({ type: "phase", phase: "active" }); dispatch({ type: "mode", mode: "operator", operator }); },
    release: () => { dispatch({ type: "mode", mode: "ai", operator: null }); line("bot", "Я снова с вами. Чем ещё могу помочь?"); },
  }), [chat, line]);

  return { state, ref, line, notice, showError, send, ask, start, choose, toRegistrar, ...actions };
}

export type CallSession = ReturnType<typeof useCallSession>;
