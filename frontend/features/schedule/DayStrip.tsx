// Полоса из 7 дней с количеством записей к врачу.

import { addDays, humanDay, keyOf } from "@/shared/domain/dates";
import { workingHours, type Doctor } from "@/shared/domain/doctors";
import type { Ticket } from "@/shared/types/ticket";
import { doctorDayTickets } from "./scheduleRules";

export default function DayStrip({ doctor, tickets, value, onChange, days = 7 }: {
  doctor: Doctor; tickets: Ticket[]; value: string; onChange: (k: string) => void; days?: number;
}) {
  const start = new Date();
  return (
    <div className="days">
      {Array.from({ length: days }, (_, i) => addDays(start, i)).map((d) => {
        const k = keyOf(d);
        const off = !workingHours(doctor, d);
        return (
          <button key={k} className={`day ${k === value ? "on" : ""} ${off ? "off" : ""}`} onClick={() => onChange(k)}>
            <b>{humanDay(d).split(",")[0]}</b>
            <span>{d.getDate()}.{String(d.getMonth() + 1).padStart(2, "0")}</span>
            <small>{off ? "выходной" : `${doctorDayTickets(tickets, doctor, k).length} зап.`}</small>
          </button>
        );
      })}
    </div>
  );
}
