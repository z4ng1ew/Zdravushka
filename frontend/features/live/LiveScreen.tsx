"use client";

// «Диалоги»: регистратор видит разговор ИИ с пациентом в реальном времени и может его перехватить.

import { useEffect, useRef } from "react";
import Bubble, { SpeakerLegend } from "@/shared/ui/Bubble";
import LiveFacts from "./LiveFacts";
import LiveStatusBar from "./LiveStatusBar";
import OperatorReply from "./OperatorReply";
import { useLiveCall } from "./useLiveCall";

function NoCall() {
  return (
    <div className="card live-empty">
      <img src="/img/mic-flat.png" width={64} height={64} alt="" />
      <div>
        <b>Сейчас нет активных звонков</b>
        <p className="muted small">Как только пациент позвонит Здравушке, разговор появится здесь — его можно будет перехватить.</p>
      </div>
    </div>
  );
}

export default function LiveScreen() {
  const { call, say, takeover, release } = useLiveCall();
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { box.current?.scrollTo({ top: box.current.scrollHeight, behavior: "smooth" }); }, [call?.lines.length]);

  return (
    <>
      <h1 className="page-title">Звонок сейчас</h1>
      <p className="page-sub">
        Вы видите разговор ИИ с пациентом в реальном времени и можете перехватить его в любой момент —
        например, если пациент нервничает или ИИ не справляется.
      </p>
      {!call || call.phase === "idle" ? <NoCall /> : (
        <div className="grid grid-queue" style={{ gridTemplateColumns: "1.5fr 1fr" }}>
          <div className="card">
            <LiveStatusBar call={call} onTakeover={takeover} onRelease={release} />
            <SpeakerLegend />
            <div className="dialog dialog-live" ref={box}>
              {call.lines.map((l, i) => <Bubble key={i} {...l} operator={call.operator} small />)}
            </div>
            {call.mode === "operator" && call.phase === "active" && <OperatorReply onSay={say} />}
          </div>
          <LiveFacts call={call} />
        </div>
      )}
    </>
  );
}
