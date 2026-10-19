"use client";

// «Мои талоны»: талоны, полученные в этом браузере, с поиском. Без даты рождения и полного ФИО (152-ФЗ).

import Link from "next/link";
import { useMemo, useState } from "react";
import { matchTicket, splitTickets, ticketKey } from "@/shared/domain/tickets";
import { useTickets } from "@/shared/store/ticketStorage";
import type { Ticket } from "@/shared/types/ticket";
import { ITicket } from "@/shared/ui/NavIcons";
import PatientHeader from "@/shared/ui/PatientHeader";
import SearchBox from "@/shared/ui/SearchBox";
import Section from "@/shared/ui/Section";
import TicketCard from "@/shared/ui/TicketCard";

const TicketList = ({ list }: { list: Ticket[] }) => (
  <div className="ticket-list">{list.map((t) => <TicketCard key={ticketKey(t)} ticket={t} />)}</div>
);

export default function TicketsScreen() {
  const { tickets } = useTickets();
  const [q, setQ] = useState("");
  const { upcoming, rest } = useMemo(() => splitTickets(tickets.filter((t) => matchTicket(t, q))), [tickets, q]);

  return (
    <div className="page">
      <PatientHeader page="tickets" />
      <div className="main2">
        <div className="panel-head">
          <h1 className="panel-title">Мои талоны</h1>
          <span className="panel-sub">Куда и когда вы записаны</span>
        </div>
        <SearchBox value={q} onChange={setQ} placeholder="Врач, специальность, номер записи или дата" />
        <p className="store-note">
          Талоны хранятся только в этом браузере, без даты рождения и полного ФИО (152-ФЗ), и удаляются через 30 дней после приёма.
        </p>
        <Section icon={<ITicket size={24} />} title="Предстоящие приёмы" badge={<span className="sec-badge sec-badge-light">{upcoming.length}</span>}>
          {upcoming.length
            ? <TicketList list={upcoming} />
            : <div className="empty-row">Пусто. <Link href="/" className="link-staff">Записаться через Здравушку →</Link></div>}
        </Section>
        {rest.length > 0 && (
          <Section icon={<ITicket size={24} />} title="Прошедшие и отменённые"><TicketList list={rest} /></Section>
        )}
      </div>
    </div>
  );
}
