"use client";

// «Расписание»: выбрать врача и день — график, кабинет и кто записан через Здравушку.
// Врачи и графики — справочник сервера (GET /api/doctors).

import { useMemo, useState } from "react";
import { parseKey, todayKey } from "@/shared/domain/dates";
import { workingHours, type Doctor } from "@/shared/domain/doctors";
import { useDoctors } from "@/shared/hooks/useDoctors";
import { useTickets } from "@/shared/store/ticketStorage";
import type { Ticket } from "@/shared/types/ticket";
import { ErrorInline } from "@/shared/ui/ErrorCode";
import { ICalendar } from "@/shared/ui/NavIcons";
import Section from "@/shared/ui/Section";
import Spinner from "@/shared/ui/Spinner";
import DaySchedule from "./DaySchedule";
import DayStrip from "./DayStrip";
import DoctorPicker, { filterDoctors } from "./DoctorPicker";

export default function ScheduleScreen() {
  const { doctors, loaded, error } = useDoctors();
  const { tickets } = useTickets();
  return (
    <>
      <div className="panel-head">
        <h1 className="panel-title">Расписание</h1>
        <span className="panel-sub">{doctors.length ? `${doctors.length} врачей · ` : ""}график и кабинеты из расписания поликлиники</span>
      </div>
      {error && !doctors.length && <ErrorInline status={error.status} detail={error.message} />}
      {!error && !loaded && <div className="empty-row"><Spinner /> Загружаю справочник врачей…</div>}
      {loaded && !doctors.length && <div className="empty-row">Пусто — в справочнике сервера нет врачей.</div>}
      {doctors.length > 0 && <Schedule doctors={doctors} tickets={tickets} />}
    </>
  );
}

function Schedule({ doctors, tickets }: { doctors: Doctor[]; tickets: Ticket[] }) {
  const [spec, setSpec] = useState("");
  const [q, setQ] = useState("");
  const [day, setDay] = useState(todayKey());
  const [docId, setDocId] = useState<number | null>(null);
  const list = useMemo(() => filterDoctors(doctors, spec, q), [doctors, spec, q]);
  const doctor = list.find((d) => d.id === docId) ?? list[0] ?? doctors[0];
  const hours = workingHours(doctor, parseKey(day));
  const title = `${doctor.fullName} — ${doctor.specialty.toLowerCase()}${doctor.cabinet ? `, кабинет ${doctor.cabinet}` : ""}`;
  return (
    <>
      <DoctorPicker all={doctors} spec={spec} q={q} list={list} current={doctor} day={day} tickets={tickets}
        onSpec={setSpec} onQuery={setQ} onPick={setDocId} />
      <Section icon={<ICalendar size={24} />} title={title}
        badge={<span className="sec-hint">{hours ? `приём ${hours}` : "нет приёма"}</span>}>
        <DayStrip doctor={doctor} tickets={tickets} value={day} onChange={setDay} />
        <DaySchedule doctor={doctor} dayKey={day} tickets={tickets} />
        <p className="muted small" style={{ marginTop: 10 }}>
          Сетка — по графику врача. Занятость слотов знает МИС; здесь отмечены записи, сделанные через Здравушку.
        </p>
      </Section>
    </>
  );
}
