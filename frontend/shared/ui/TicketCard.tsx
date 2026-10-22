"use client";

// Талон на приём — квитанция по записи в МИС: ассистент, врач, дата/время/кабинет, плашка «Записано в МИС».
// Справа — номер записи в МИС (его называют в регистратуре). Можно распечатать.

import { useRef } from "react";
import { relDay, splitDT } from "@/shared/domain/dates";
import { specialtyTitle } from "@/shared/domain/doctors";
import { printOne } from "@/shared/browser/printOne";
import type { Ticket } from "@/shared/types/ticket";
import { CalendarIcon, CheckCircle, ClockIcon, PinIcon } from "./Icons";
import { IPrint } from "./NavIcons";

const RESULT: Record<Ticket["status"], { cls: string; title: string; ok: boolean }> = {
  "Запланирована": { cls: "result-ok", title: "Записано в МИС", ok: true },
  "Завершена": { cls: "result-ok", title: "Приём состоялся", ok: true },
  "Неявка": { cls: "result-warn", title: "Пациент не пришёл", ok: false },
  "Отменена": { cls: "result-off", title: "Запись отменена", ok: false },
};

/** Строка под итогом: номер записи МИС и памятка для запланированного приёма */
function resultNote(t: Ticket): string {
  if (t.status !== "Запланирована") return `Талон к записи № ${t.visitId}`;
  return `Талон к записи № ${t.visitId} · приходите за 10 минут, возьмите паспорт и полис`;
}

export default function TicketCard({ ticket, compact }: { ticket: Ticket; compact?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const { date, time } = splitDT(ticket.scheduledAt);
  const r = RESULT[ticket.status];
  const hasCab = ticket.cabinet && ticket.cabinet !== "—";
  const patient = ticket.patient && ticket.patient !== "Пациент" ? ticket.patient : "не указан";

  return (
    <div ref={ref} className={`record ticket2 ${compact ? "ticket2-compact" : ""} ${ticket.status === "Отменена" ? "ticket2-off" : ""}`}>
      <div className="doctor-head">
        <img src="/img/mascot-ticket.png" width={compact ? 76 : 88} height={compact ? 76 : 88} alt="" className="ticket2-mascot" />
        <div className="doctor-name">
          <b>{ticket.doctor}</b>
          <span>{specialtyTitle(ticket.specialty)}</span>
        </div>
        <div className="ticket2-no">
          <small>запись №</small>
          <b>{ticket.visitId}</b>
        </div>
      </div>
      {!compact && (
        <div className="ticket2-patient">Пациент: <b>{patient}</b></div>
      )}
      <div className="record-grid">
        <div><CalendarIcon /><small>Дата</small><div>{date} <em className="rel">{relDay(date).split(",")[0]}</em></div></div>
        <div><ClockIcon /><small>Время</small><div>{time}</div></div>
        {hasCab && <div><PinIcon /><small>Кабинет</small><div>{ticket.cabinet}</div></div>}
      </div>
      <div className={`result ${r.cls}`}>
        <span className="ok-ico">{r.ok ? <CheckCircle size={22} /> : <ClockIcon size={22} />}</span>
        <div>
          <b>{r.title}</b>
          <div>{resultNote(ticket)}</div>
        </div>
        <button type="button" className="ticket-print" onClick={() => printOne(ref.current)}
          aria-label={`Распечатать талон к записи № ${ticket.visitId}`}><IPrint /></button>
      </div>
    </div>
  );
}
