"use client";

// Экран пациента «Позвонить Здравушке»: собирает блоки и связывает их с логикой звонка.
// Логика — в хуках (сессия /api/chat, голос, связь с регистратором, таймер), правила — в model/.

import { useEffect, useMemo, useRef } from "react";
import { useHealth } from "@/shared/hooks/useHealth";
import MisBadge from "@/shared/ui/MisBadge";
import PatientHeader from "@/shared/ui/PatientHeader";
import CallButtons from "./components/CallButtons";
import CallStatus from "./components/CallStatus";
import DialogPanel from "./components/DialogPanel";
import Greeting from "./components/Greeting";
import MicButton from "./components/MicButton";
import PhoneCard from "./components/PhoneCard";
import DetailsPanel from "./details/DetailsPanel";
import { useCallSession } from "./hooks/useCallSession";
import { useCallTimer } from "./hooks/useCallTimer";
import { useLiveBridge } from "./hooks/useLiveBridge";
import { useVoiceTurns } from "./hooks/useVoiceTurns";
import { canCall, canTalk, pillView, statusText } from "./model/callView";
import { feedLines } from "./model/feed";

export default function CallScreen() {
  const health = useHealth();
  const call = useCallSession(health.mode);
  const voice = useVoiceTurns(call);
  const s = call.state;
  const { showError } = call;
  const seconds = useCallTimer(s.phase, s.callNo);
  const active = s.phase === "active";

  // Сервер не ответил при открытии — показываем ошибку в ленте один раз
  const healthShown = useRef(false);
  useEffect(() => {
    if (health.error && !healthShown.current) { healthShown.current = true; showError(health.error); }
  }, [health.error, showError]);

  const live = useMemo(() => ({
    phase: s.phase, mode: s.mode, seconds, intent: s.intent, fields: s.fields, lines: feedLines(s.feed), operator: s.operator,
  }), [s.phase, s.mode, seconds, s.intent, s.fields, s.feed, s.operator]);
  useLiveBridge(live, {
    onTakeover: (op) => { voice.cancel(); call.takeover(op); },
    onRelease: call.release,
    onOperatorSay: (text) => call.line("operator", text),
  });

  const choose = (i: number) => { if (s.sending) return; voice.cancel(); voice.follow(call.choose(i)); };
  const say = (text: string) => {
    if (s.sending) return;
    if (!active) return voice.begin(text);
    voice.follow(call.ask(text));
  };
  const send = (text: string) => {
    if (s.mode !== "ai") return call.line("patient", text); // с регистратором — просто передаём фразу
    if (!active) return voice.begin(text);
    voice.follow(call.ask(text));
  };
  const retry = (text: string) => { if (!s.sending) voice.follow(call.send(text)); };
  const toRegistrar = () => { if (s.sending || s.mode !== "ai") return; voice.cancel(); call.toRegistrar(); };
  const end = () => { voice.stop(); call.end(); };

  return (
    <div className="page">
      <PatientHeader page="call" status={<MisBadge health={health} />} />
      <section className="panel call-panel">
        <div className="call-left">
          <Greeting />
          <CallStatus active={active} seconds={seconds} pill={pillView(s)} />
          <MicButton canCall={canCall(s)} canTalk={canTalk(s, voice.flags)} listening={voice.flags.listening}
            ended={s.phase === "ended"} active={active} mode={s.mode} onPress={voice.press} />
          <div className={`mic-status ${s.mode === "operator" ? "st-op" : s.mode === "waiting" ? "st-wait" : ""}`}>
            {statusText(s, voice.flags)}
          </div>
          <CallButtons active={active} aiLeads={s.mode === "ai"} sending={s.sending}
            onEnd={end} onRegistrar={toRegistrar} onRestart={voice.restart} />
          <PhoneCard />
        </div>
        <DialogPanel call={s} canCall={canCall(s)} onReplay={voice.canReplay ? voice.speak : undefined} onRetry={retry}
          onChoose={choose} onSay={say} onSend={send} onMic={voice.press} />
      </section>
      <DetailsPanel call={s} onChoose={choose} />
    </div>
  );
}
