// Расшифровка разговора в тех же цветах, что на экране пациента (очередь, журнал, ошибки).

import type { Utterance } from "@/shared/types/staff";
import Bubble from "./Bubble";

/** Незнакомого говорящего показываем как пациента */
const speakerOf = (s: string) => (s === "bot" || s === "operator" ? s : "patient");

export default function Transcript({ items }: { items: Utterance[] }) {
  return (
    <div className="q-transcript">
      {items.length === 0 && <div className="muted small">Пусто</div>}
      {items.map((u, i) => <Bubble key={i} speaker={speakerOf(u.speaker)} text={u.text} at={u.at} small />)}
    </div>
  );
}
