"use client";

// Демо-звонок из этого браузера (экран пациента в соседней вкладке, связь через BroadcastChannel):
// регистратор видит разговор и может его перехватить.

import { useEffect, useRef } from "react";
import type { LiveCall } from "@/shared/types/live";
import Bubble, { SpeakerLegend } from "@/shared/ui/Bubble";
import LiveFacts from "./LiveFacts";
import LiveStatusBar from "./LiveStatusBar";
import OperatorReply from "./OperatorReply";

export default function WebCall({ call, onSay, onTakeover, onRelease }: {
  call: LiveCall; onSay: (text: string) => void; onTakeover: () => void; onRelease: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { box.current?.scrollTo({ top: box.current.scrollHeight, behavior: "smooth" }); }, [call.lines.length]);
  return (
    <>
      <h2 className="live-sub">Демо-звонок из этого браузера</h2>
      <div className="grid grid-queue" style={{ gridTemplateColumns: "1.5fr 1fr" }}>
        <div className="card">
          <LiveStatusBar call={call} onTakeover={onTakeover} onRelease={onRelease} />
          <SpeakerLegend />
          <div className="dialog dialog-live" ref={box}>
            {call.lines.map((l, i) => <Bubble key={i} {...l} operator={call.operator} small />)}
          </div>
          {call.mode === "operator" && call.phase === "active" && <OperatorReply onSay={onSay} />}
        </div>
        <LiveFacts call={call} />
      </div>
    </>
  );
}
