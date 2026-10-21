"use client";

// Большая кнопка микрофона с подсказкой над ней и «всплеском» при нажатии.

import { useState } from "react";
import type { CallMode } from "@/shared/types/live";

export interface MicProps {
  canCall: boolean; // звонка нет — нажатие начинает звонок
  canTalk: boolean; // можно говорить
  listening: boolean;
  ended: boolean;
  active: boolean;
  mode: CallMode;
  onPress: () => void;
}

function Hint({ canCall, canTalk, listening, ended }: Pick<MicProps, "canCall" | "canTalk" | "listening" | "ended">) {
  if (listening) return <div className="mic-hint mic-hint-rec">● Говорите… нажмите, чтобы отправить</div>;
  if (canCall) return <div className="mic-hint">{ended ? "Позвонить ещё раз" : "Нажмите, чтобы позвонить"}</div>;
  if (canTalk) return <div className="mic-hint">Нажмите и говорите</div>;
  return null;
}

export default function MicButton(p: MicProps) {
  const [bursts, setBursts] = useState<number[]>([]);
  function press() {
    const id = Date.now();
    setBursts((b) => [...b, id]);
    setTimeout(() => setBursts((b) => b.filter((x) => x !== id)), 700);
    p.onPress();
  }
  const idle = p.canCall || (p.canTalk && !p.listening);
  const cls = ["mic", p.active && "mic-on", p.mode === "operator" && "mic-op", p.mode === "waiting" && "mic-wait"].filter(Boolean).join(" ");
  return (
    <div className={`mic-wrap ${idle ? "mic-idle" : ""} ${p.listening ? "mic-listen" : ""}`}>
      <Hint {...p} />
      <button className={cls} onClick={press} aria-disabled={!p.canCall && !p.canTalk}
        aria-label={p.canCall ? "Позвонить Здравушке" : p.listening ? "Отправить фразу" : "Говорить"}>
        <span className="ring r1" /><span className="ring r2" /><span className="ring r3" />
        <img src="/img/mic-glow.png" alt="" className="mic-img" draggable={false} />
        {bursts.map((id) => <span key={id} className="burst" />)}
      </button>
    </div>
  );
}
