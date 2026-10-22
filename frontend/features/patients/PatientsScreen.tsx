"use client";

// «Пациенты»: записанные голосовым помощником в этом браузере (маскированное ФИО) и их талоны.

import { Fragment, useMemo, useState } from "react";
import { norm } from "@/shared/domain/masking";
import { groupPatients, ticketKey, type PatientGroup } from "@/shared/domain/tickets";
import { useTickets } from "@/shared/store/ticketStorage";
import { IUsers } from "@/shared/ui/NavIcons";
import SearchBox from "@/shared/ui/SearchBox";
import Section from "@/shared/ui/Section";
import TicketCard from "@/shared/ui/TicketCard";
import { toggleRow } from "@/shared/ui/toggleRow";

const nextText = (p: PatientGroup) =>
  p.next ? `${p.next.scheduledAt} · ${p.next.specialty.toLowerCase()} · запись № ${p.next.visitId}` : "—";

export default function PatientsScreen() {
  const { tickets } = useTickets();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const patients = useMemo(() => groupPatients(tickets).filter((p) => !q || norm(p.name).includes(norm(q))), [tickets, q]);

  return (
    <>
      <div className="panel-head">
        <h1 className="panel-title">Пациенты</h1>
        <span className="panel-sub">Записанные голосовым помощником и их талоны</span>
      </div>
      <SearchBox value={q} onChange={setQ} placeholder="Фамилия пациента…" />
      <Section icon={<IUsers size={24} />} title="Пациенты" badge={<span className="sec-badge sec-badge-light">{patients.length}</span>}>
        <table className="t2">
          <thead><tr><th>Пациент</th><th>Записей</th><th>Ближайший приём</th></tr></thead>
          <tbody>
            {patients.length === 0 && <tr><td colSpan={3} className="empty-row">Пусто</td></tr>}
            {patients.map((p) => {
              const key = p.name || p.tickets[0].number;
              return (
                <Fragment key={key}>
                  <tr {...toggleRow(open === key, () => setOpen(open === key ? null : key))}>
                    <td><b>{p.name || "не указан"}</b></td><td>{p.tickets.length}</td><td>{nextText(p)}</td>
                  </tr>
                  {open === key && (
                    <tr><td colSpan={3}><div className="ticket-list">{p.tickets.map((t) => <TicketCard key={ticketKey(t)} ticket={t} />)}</div></td></tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </Section>
    </>
  );
}
