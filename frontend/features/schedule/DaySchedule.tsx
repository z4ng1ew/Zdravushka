// Сетка приёма врача на день: слоты по графику и пациенты с талонами.

import { humanDay, parseKey } from "@/shared/domain/dates";
import { workingHours, type Doctor } from "@/shared/domain/doctors";
import { ticketKey, ticketTime } from "@/shared/domain/tickets";
import type { Ticket, TicketStatus } from "@/shared/types/ticket";
import { doctorDayTickets, isPast, slotTimes } from "./scheduleRules";

const STATUS_CLS: Record<TicketStatus, string> = {
  "Запланирована": "sp-blue", "Завершена": "sp-green", "Неявка": "sp-orange", "Отменена": "sp-red",
};

function BusySlot({ time, t }: { time: string; t: Ticket }) {
  return (
    <div className="slot slot-busy">
      <span className="slot-time">{time}</span>
      <div className="slot-who">
        <b>{t.patient || "не указан"}</b>
        <small>талон {t.number}{t.visitId ? ` · запись МИС № ${t.visitId}` : ""}</small>
      </div>
      <span className={`sp ${STATUS_CLS[t.status]}`}>{t.status}</span>
    </div>
  );
}

export default function DaySchedule({ doctor, dayKey, tickets }: { doctor: Doctor; dayKey: string; tickets: Ticket[] }) {
  const day = parseKey(dayKey);
  const list = doctorDayTickets(tickets, doctor, dayKey);
  if (!workingHours(doctor, day) && list.length === 0) {
    return <div className="empty-row">{humanDay(day)} — у врача нет приёма.</div>;
  }
  return (
    <div className="slots">
      {slotTimes(doctor, day, list).map((tm) => {
        const booked = list.filter((t) => ticketTime(t) === tm);
        if (booked.length) return booked.map((t) => <BusySlot key={ticketKey(t)} time={tm} t={t} />);
        return (
          <div key={tm} className={`slot slot-free ${isPast(day, tm) ? "slot-past" : ""}`}>
            <span className="slot-time">{tm}</span><span className="slot-empty">пусто</span>
          </div>
        );
      })}
    </div>
  );
}
