// Выбор врача: фильтр по специальности, поиск по фамилии или кабинету и вкладки врачей.

import { DOCTORS, SPECIALTIES, shortName, type Doctor } from "@/shared/domain/doctors";
import type { Ticket } from "@/shared/types/ticket";
import { doctorDayTickets } from "./scheduleRules";

export function filterDoctors(spec: string, q: string): Doctor[] {
  const s = q.trim().toLowerCase();
  return DOCTORS.filter((d) => (!spec || d.specialty === spec) && (!s || d.fullName.toLowerCase().includes(s) || d.cabinet.includes(s)));
}

export default function DoctorPicker({ spec, q, list, current, day, tickets, onSpec, onQuery, onPick }: {
  spec: string; q: string; list: Doctor[]; current: Doctor; day: string; tickets: Ticket[];
  onSpec: (s: string) => void; onQuery: (q: string) => void; onPick: (id: number) => void;
}) {
  return (
    <>
      <div className="sched-filter">
        <select className="sec-select sec-select-light" value={spec} onChange={(e) => onSpec(e.target.value)}>
          <option value="">Все специальности</option>
          {SPECIALTIES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <input className="tk-input" placeholder="Фамилия врача или кабинет" value={q} onChange={(e) => onQuery(e.target.value)} />
      </div>
      <div className="doc-tabs">
        {list.length === 0 && <div className="empty-row">Пусто</div>}
        {list.map((d) => (
          <button key={d.id} className={`doc-tab ${d.id === current.id ? "on" : ""}`} onClick={() => onPick(d.id)}>
            <b>{shortName(d.fullName)}</b>
            <small>{d.specialty}{d.cabinet ? ` · каб. ${d.cabinet}` : ""}</small>
            <span className="doc-count">{doctorDayTickets(tickets, d, day).length}</span>
          </button>
        ))}
      </div>
    </>
  );
}
