"use client";

// «Расписание»: выбрать врача и день — график, кабинет и кто записан через Здравушку.
// Врачи и графики — снимок data/schedule.json бэкенда (shared/domain/doctors.data.json).

import { useMemo, useState } from "react";
import { parseKey, todayKey } from "@/shared/domain/dates";
import { DOCTORS, workingHours } from "@/shared/domain/doctors";
import { useTickets } from "@/shared/store/ticketStorage";
import { ICalendar } from "@/shared/ui/NavIcons";
import Section from "@/shared/ui/Section";
import DaySchedule from "./DaySchedule";
import DayStrip from "./DayStrip";
import DoctorPicker, { filterDoctors } from "./DoctorPicker";

export default function ScheduleScreen() {
  const { tickets } = useTickets();
  const [spec, setSpec] = useState("");
  const [q, setQ] = useState("");
  const [day, setDay] = useState(todayKey());
  const [docId, setDocId] = useState<number | null>(null);
  const list = useMemo(() => filterDoctors(spec, q), [spec, q]);
  const doctor = list.find((d) => d.id === docId) ?? list[0] ?? DOCTORS[0];
  const hours = workingHours(doctor, parseKey(day));
  const title = `${doctor.fullName} — ${doctor.specialty.toLowerCase()}${doctor.cabinet ? `, кабинет ${doctor.cabinet}` : ""}`;

  return (
    <>
      <div className="panel-head">
        <h1 className="panel-title">Расписание</h1>
        <span className="panel-sub">{DOCTORS.length} врачей · график и кабинеты из расписания поликлиники</span>
      </div>
      <DoctorPicker spec={spec} q={q} list={list} current={doctor} day={day} tickets={tickets}
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
