"use client";

// Раздел «Журнал звонков бота» (GET /api/calls) с фильтром по итогу.

import { useMemo, useState } from "react";
import type { Polled } from "@/shared/hooks/usePolling";
import type { Call } from "@/shared/types/staff";
import { IJournal } from "@/shared/ui/NavIcons";
import Section from "@/shared/ui/Section";
import CallRow from "./CallRow";
import { filterJournal, RESULT_VIEW, type JournalFilter } from "./journalView";

const HEAD = ["Время", "Направление", "Пациент", "Итог", "Цель звонка", "Длительность", "Запросы к МИС"];

function FilterSelect({ value, onChange }: { value: JournalFilter; onChange: (v: JournalFilter) => void }) {
  return (
    <select className="sec-select" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="bot">Записи, переносы, отмены</option>
      <option value="all">Все звонки</option>
      {Object.entries(RESULT_VIEW).map(([res, a]) => <option key={res} value={res}>{a.text}</option>)}
    </select>
  );
}

export default function CallsJournal({ calls }: { calls: Polled<Call[]> }) {
  const [filter, setFilter] = useState<JournalFilter>("bot");
  const list = useMemo(() => filterJournal(calls.data ?? [], filter), [calls.data, filter]);
  return (
    <Section icon={<IJournal size={24} />} title="Журнал звонков бота" right={<FilterSelect value={filter} onChange={setFilter} />}>
      <table className="t2">
        <thead><tr>{HEAD.map((h) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>
          {calls.data === null && <tr><td colSpan={HEAD.length} className="empty-row">Загружаю…</td></tr>}
          {calls.data !== null && list.length === 0 && <tr><td colSpan={HEAD.length} className="empty-row">Пусто</td></tr>}
          {list.map((c) => <CallRow key={c.id} c={c} />)}
        </tbody>
      </table>
    </Section>
  );
}
