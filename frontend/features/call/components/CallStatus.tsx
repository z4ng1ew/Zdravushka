// Строка статуса у микрофона: «На линии / Свободно», таймер и кто ведёт разговор.

import { hms } from "@/shared/domain/dates";

export default function CallStatus({ active, seconds, pill }: {
  active: boolean; seconds: number; pill: { cls: string; text: string };
}) {
  return (
    <div className="call-status">
      <span className={`live ${active ? "on" : ""}`} data-tip={active ? "Идёт разговор" : "Сейчас никто не звонит"}>
        <i />{active ? "На линии" : "Свободно"}
      </span>
      <span className="timer" data-tip="Длительность звонка">{hms(seconds)}</span>
      <span className={`pill ${pill.cls}`} data-tip="Кто сейчас ведёт разговор: ИИ или живой регистратор">{pill.text}</span>
    </div>
  );
}
