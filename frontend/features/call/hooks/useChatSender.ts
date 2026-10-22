"use client";

// Отправка фразы в POST /api/chat для экрана звонка: сессия разговора, номер звонка и разбор ответа.
// gen — номер звонка на странице: ответ, пришедший после «Заново» или «Завершить», к новому звонку
// не прилипает (талон по нему всё равно выдаётся — запись в МИС уже сделана).

import { useCallback, useMemo, useRef, type Dispatch } from "react";
import { sendChat } from "@/shared/api/chat";
import { toApiError } from "@/shared/api/ApiError";
import { toUiBooking } from "@/shared/domain/booking";
import type { MisMode } from "@/shared/domain/misMode";
import { replyExplain, replyTags, replyTech } from "@/shared/domain/replyTags";
import { issueTicket } from "@/shared/store/ticketActions";
import type { ChatResponse } from "@/shared/types/chat";
import type { CallAction } from "../model/callState";

export function useChatSender(dispatch: Dispatch<CallAction>, mis: MisMode) {
  const session = useRef<string | null>(null);
  const gen = useRef(0);
  const misRef = useRef(mis);
  misRef.current = mis;

  /** Отправить текст боту и применить ответ. null — ошибка (уже показана в ленте) или звонок сменился */
  const send = useCallback(async (text: string, confidence?: number): Promise<ChatResponse | null> => {
    const my = gen.current;
    dispatch({ type: "sending", value: true });
    try {
      const r = await sendChat(session.current, text, confidence);
      const ticket = issueTicket(r);
      if (my !== gen.current) return null; // звонок уже другой — ответ устарел
      session.current = r.session_id || session.current;
      const booking = r.booking ? toUiBooking(r.booking, r.intent, misRef.current) : null;
      dispatch({ type: "reply", r, tags: replyTags(r), explain: replyExplain(r), tech: replyTech(r, confidence), booking, ticket });
      return r;
    } catch (e) {
      // фразу пациента можно отправить ещё раз кнопкой — сами не повторяем, чтобы не записать дважды
      if (my === gen.current) dispatch({ type: "error", error: toApiError(e), retry: text || undefined });
      return null;
    } finally {
      if (my === gen.current) dispatch({ type: "sending", value: false });
    }
  }, [dispatch]);

  /** Новый звонок: новая сессия; ответы старого звонка больше не применяются. Возвращает номер звонка */
  const newCall = useCallback(() => { session.current = null; return ++gen.current; }, []);
  /** Звонок завершён — опоздавший ответ не добавится в ленту */
  const closeCall = useCallback(() => { gen.current += 1; }, []);
  const isCurrent = useCallback((my: number) => my === gen.current, []);
  const current = useCallback(() => gen.current, []);

  return useMemo(() => ({ send, newCall, closeCall, isCurrent, current }), [send, newCall, closeCall, isCurrent, current]);
}
