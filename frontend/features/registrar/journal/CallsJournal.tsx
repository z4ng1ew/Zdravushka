"use client";

// Раздел «Журнал звонков бота» (GET /api/calls): фильтр по итогу, поиск, по 20 звонков на странице.

import { useMemo, useState } from "react";
import { useListPage } from "@/shared/hooks/useListPage";
import type { Polled } from "@/shared/hooks/usePolling";
import type { Call } from "@/shared/types/staff";
import { IJournal } from "@/shared/ui/NavIcons";
import Pager from "@/shared/ui/Pager";
import SearchBox from "@/shared/ui/SearchBox";
import Section from "@/shared/ui/Section";
import CallRow from "./CallRow";
import { filterJournal, RESULT_VIEW, type JournalFilter } from "./journalView";

const HEAD = ["Время", "Направление", "Пациент", "Итог", "Цель звонка", "Длительность", "Запросы к МИС"];
const PAGE_SIZE = 20;

function FilterSelect({ value, onChange }: { value: JournalFilter; onChange: (v: JournalFilter) => void }) {
  return (
    <select className="sec-select" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Какие звонки показать">
      <option value="bot">Записи, переносы, отмены</option>
      <option value="all">Все звонки</option>
      <option value="flagged">⚠︎ С отметками (промпт-инъекция)</option>
      {Object.entries(RESULT_VIEW).map(([res, a]) => <option key={res} value={res}>{a.text}</option>)}
    </select>
  );
}

export default function CallsJournal({ calls }: { calls: Polled<Call[]> }) {
  const [filter, setFilter] = useState<JournalFilter>("bot");
  const [q, setQ] = useState("");
  const list = useMemo(() => filterJournal(calls.data ?? [], filter, q), [calls.data, filter, q]);
  const { view, setPage } = useListPage(list, PAGE_SIZE, `${filter}|${q}`);
  const empty = q ? "Ничего не найдено" : "Пусто";
  return (
    <Section icon={<IJournal size={24} />} title="Журнал звонков бота" right={<FilterSelect value={filter} onChange={setFilter} />}>
      <div className="list-tools">
        <SearchBox value={q} onChange={setQ} placeholder="Поиск: пациент, итог, цель, дата" />
        {q && <span className="list-found">найдено: {list.length}</span>}
      </div>
      <table className="t2">
        <thead><tr>{HEAD.map((h) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>
          {calls.data === null && <tr><td colSpan={HEAD.length} className="empty-row">Загружаю…</td></tr>}
          {calls.data !== null && list.length === 0 && <tr><td colSpan={HEAD.length} className="empty-row">{empty}</td></tr>}
          {view.items.map((c) => <CallRow key={c.id} c={c} />)}
        </tbody>
      </table>
      <Pager page={view} onPage={setPage} />
    </Section>
  );
}
