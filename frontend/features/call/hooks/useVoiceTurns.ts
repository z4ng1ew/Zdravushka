"use client";

// Голосовой разговор: микрофон (useMicrophone) → /api/asr → фраза боту → озвучка ответа (useSpeaker) → снова слушать.
// Ошибки голоса не обрывают звонок: пациенту — понятная подсказка (model/speechMisses.ts).
// turn — номер «хода»: «Заново», «Завершить», перехват и выбор варианта его меняют, и опоздавшие шаги
// (распознанная фраза, ответ сервера, озвучка) старого хода молча отбрасываются.

import { useRef, useState } from "react";
import { toApiError } from "@/shared/api/ApiError";
import { recognize } from "@/shared/api/speech";
import type { ChatResponse } from "@/shared/types/chat";
import { ECHO_TAIL_MS, emptyReaction, freshCounts, MIC_TEXT, silenceReaction, type MissReaction } from "../model/speechMisses";
import type { CallSession } from "./useCallSession";
import { useMicrophone } from "./useMicrophone";
import { useSpeaker } from "./useSpeaker";

const TEMPORARY = [408, 502, 503]; // временный сбой распознавания — как промах, звонок продолжается

const wait = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

type Heard = { kind: "text"; text: string; confidence?: number } | { kind: "miss" } | { kind: "error"; error: unknown };

/** Распознать фразу: текст, промах (пусто или временный сбой) или ошибка, которую надо показать */
async function hear(audio: Blob): Promise<Heard> {
  try {
    const res = await recognize(audio);
    return res.text ? { kind: "text", text: res.text, confidence: res.confidence ?? undefined } : { kind: "miss" };
  } catch (e) {
    return TEMPORARY.includes(toApiError(e).status ?? 0) ? { kind: "miss" } : { kind: "error", error: e };
  }
}

// Шаги голосового цикла ссылаются друг на друга, поэтому объявлены как function (всплытие).
// Внутри — только ref и стабильные функции, так что старые замыкания безопасны.
export function useVoiceTurns(call: CallSession) {
  const mic = useMicrophone();
  const speaker = useSpeaker();
  const [transcribing, setTranscribing] = useState(false);
  const voiceOn = useRef(false); // звонок ведётся голосом (начат с микрофона)
  const turn = useRef(0);
  const count = useRef(freshCounts()); // промахи распознавания, тишина и шум подряд
  const fresh = (my: number) => my === turn.current && call.ref.current.phase === "active" && call.ref.current.mode === "ai";

  /** Озвучить фразу с выключенным микрофоном и, если ход тот же, снова слушать — после того как стихнет эхо */
  async function sayThenListen(text: string, my: number, again: boolean) {
    mic.cancel(); // микрофон не должен записать саму Здравушку
    await speaker.speak(text);
    const go = () => again && fresh(my) && voiceOn.current && !speaker.busy();
    if (go()) { await wait(ECHO_TAIL_MS); if (go()) listen(); }
  }

  /** После ответа бота в голосовом звонке: озвучить и снова слушать пациента */
  async function afterTurn(r: ChatResponse | null, my = turn.current) {
    if (!r || !voiceOn.current || my !== turn.current) return;
    await sayThenListen(r.reply, my, !r.done && !r.escalation);
  }

  async function listen() {
    if (speaker.busy()) return; // пока Здравушка говорит, микрофон закрыт
    const problem = await mic.open(() => finish(false));
    if (problem) { voiceOn.current = false; call.notice(MIC_TEXT[problem]); }
  }

  /** manual — пациент сам нажал «отправить»: отправляем даже тихую запись */
  async function finish(manual = false) {
    const my = turn.current;
    const phrase = await mic.take();
    if (!phrase || !fresh(my)) return;
    if (!phrase.heard && !manual) { react(silenceReaction(++count.current.silent)); return; }
    count.current.silent = 0;
    setTranscribing(true);
    const heard = await hear(phrase.audio);
    setTranscribing(false);
    if (!fresh(my)) return; // звонок завершили, начали заново или перехватили — фраза устарела
    if (heard.kind === "miss") { react(emptyReaction(phrase.speechMs, count.current)); return; } // «не расслышал» — только если говорил
    if (heard.kind === "error") { voiceOn.current = false; call.showError(heard.error); return; }
    Object.assign(count.current, { misses: 0, noise: 0 });
    await afterTurn(await call.ask(heard.text, heard.text, heard.confidence), my);
  }

  /** Промах или тишина: подсказка и слушать дальше — или выключить микрофон */
  function react(r: MissReaction) {
    if (r.notice) call.notice(r.notice);
    if (r.listen) listen(); else { voiceOn.current = false; count.current = freshCounts(); }
  }

  /** Остановить микрофон и озвучку; начатые шаги этого хода больше не выполнятся */
  const cancel = () => { turn.current += 1; mic.cancel(); speaker.silence(); };
  const stop = () => { cancel(); voiceOn.current = false; count.current = freshCounts(); };
  /** Дождаться ответа бота и, если ход не сменился, озвучить его */
  const follow = async (reply: Promise<ChatResponse | null>) => { const my = turn.current; await afterTurn(await reply, my); };
  const begin = (first?: string) => follow(call.start(first));
  /** «Повторить»: микрофон выключаем на время озвучки, потом снова слушаем (если звонок голосовой) */
  const replay = (text: string) => sayThenListen(text, turn.current, true);
  /** «Заново»: прошлый звонок замолкает, новый ведётся так же — голосом или текстом */
  const restart = () => { const voice = voiceOn.current; stop(); voiceOn.current = voice; return begin(); };

  /** Кнопка микрофона: позвонить / начать говорить / отправить фразу */
  const press = () => {
    if (call.ref.current.sending || transcribing || speaker.busy()) return;
    if (call.ref.current.phase !== "active") { voiceOn.current = true; begin(); return; }
    if (mic.listening) { finish(true); return; }
    if (call.ref.current.mode === "ai") { voiceOn.current = true; listen(); }
  };

  return {
    flags: { listening: mic.listening, transcribing, speaking: speaker.speaking },
    canReplay: speaker.canReplay,
    press, begin, restart, follow, speak: replay, cancel, stop,
  };
}
