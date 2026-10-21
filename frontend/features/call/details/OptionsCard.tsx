// Варианты времени (не больше трёх — по регламенту): нажать — выбрать.

import type { ChatBooking } from "@/shared/types/chat";
import { CalendarIcon } from "@/shared/ui/Icons";

export default function OptionsCard({ options, disabled, onChoose }: {
  options: ChatBooking[]; disabled: boolean; onChoose: (i: number) => void;
}) {
  return (
    <div className="record">
      <div className="record-title">
        <CalendarIcon /> <b>Свободное время</b>
        <small>Здравушка предлагает не больше трёх вариантов — по регламенту</small>
      </div>
      <ol className="opt-list">
        {options.map((o, i) => (
          <li key={i}>
            <button onClick={() => onChoose(i)} disabled={disabled} aria-label={`Выбрать вариант ${i + 1}`}>
              <b>{i + 1}</b>
              <span>
                <span>{o.spoken ?? o.scheduled_at}</span>
                <small>{[o.doctor_name, o.specialty].filter(Boolean).join(" · ")}{o.scheduled_at ? ` · ${o.scheduled_at}` : ""}</small>
              </span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
