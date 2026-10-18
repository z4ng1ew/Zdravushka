// Варианты времени под лентой: нажать — то же, что сказать номер.

import type { ChatBooking } from "@/shared/types/chat";

export default function OptionsBar({ options, disabled, onChoose }: {
  options: ChatBooking[]; disabled: boolean; onChoose: (i: number) => void;
}) {
  if (!options.length) return null;
  return (
    <div className="options">
      <span className="options-title">Выберите время — или скажите номер:</span>
      {options.map((o, i) => (
        <button key={i} className="option" onClick={() => onChoose(i)} disabled={disabled}
          data-tip={`${o.doctor_name ?? ""}${o.specialty ? ", " + o.specialty : ""}`}>
          <b>{i + 1}</b>
          <span>{o.scheduled_at ?? o.spoken}</span>
          {o.doctor_name && <small>{o.doctor_name}</small>}
        </button>
      ))}
    </div>
  );
}
