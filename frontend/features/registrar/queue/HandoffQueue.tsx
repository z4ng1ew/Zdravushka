"use client";

// Раздел «Очередь переводов»: обращения, которые Здравушка передал регистратору (GET/PATCH /api/handoffs).
// Поиск по пациенту, причине, резюме и телефону; по 10 обращений на странице.

import { useMemo, useState } from "react";
import { updateHandoff } from "@/shared/api/staff";
import type { Actions } from "@/shared/hooks/useAction";
import { useListPage } from "@/shared/hooks/useListPage";
import type { Polled } from "@/shared/hooks/usePolling";
import type { Handoff } from "@/shared/types/staff";
import { ErrorInline } from "@/shared/ui/ErrorCode";
import { IHeadset } from "@/shared/ui/NavIcons";
import Pager from "@/shared/ui/Pager";
import SearchBox from "@/shared/ui/SearchBox";
import Section from "@/shared/ui/Section";
import HandoffRow from "./HandoffRow";
import { matchHandoff, sortQueue, type QueueSort } from "./queueRules";

const PAGE_SIZE = 10;

function Controls({ showClosed, sort, onClosed, onSort }: {
  showClosed: boolean; sort: QueueSort; onClosed: (v: boolean) => void; onSort: (s: QueueSort) => void;
}) {
  return (
    <>
      <label className="sec-check" data-tip="Показать и закрытые обращения" data-tip-pos="bottom">
        <input type="checkbox" checked={showClosed} onChange={(e) => onClosed(e.target.checked)} /> закрытые
      </label>
      <select className="sec-select" value={sort} onChange={(e) => onSort(e.target.value as QueueSort)} aria-label="Порядок">
        <option value="urgent">Сначала срочные</option>
        <option value="new">Сначала новые</option>
      </select>
    </>
  );
}

export default function HandoffQueue({ handoffs, actions }: { handoffs: Polled<Handoff[]>; actions: Actions }) {
  const [sort, setSort] = useState<QueueSort>("urgent");
  const [showClosed, setShowClosed] = useState(false);
  const [q, setQ] = useState("");
  const queue = useMemo(() => sortQueue(handoffs.data ?? [], sort, showClosed).filter((h) => matchHandoff(h, q)),
    [handoffs.data, sort, showClosed, q]);
  const { view, setPage } = useListPage(queue, PAGE_SIZE, `${q}|${sort}|${showClosed}`);
  const fresh = (handoffs.data ?? []).filter((h) => h.status === "новая").length;
  const err = handoffs.error;

  return (
    <Section icon={<IHeadset size={24} />} title="Очередь переводов"
      badge={<span className="sec-badge">{fresh} {fresh === 1 ? "новая" : "новых"}</span>}
      right={<>
        {err && <ErrorInline status={err.status} detail={err.message} />}
        <Controls showClosed={showClosed} sort={sort} onClosed={setShowClosed} onSort={setSort} />
      </>}>
      <div className="list-tools">
        <SearchBox value={q} onChange={setQ} placeholder="Поиск: пациент, причина, телефон" />
        {q && <span className="list-found">найдено: {queue.length}</span>}
      </div>
      {handoffs.data === null && !err && <div className="empty-row">Загружаю…</div>}
      {handoffs.data !== null && queue.length === 0 && <div className="empty-row">{q ? "Ничего не найдено" : "Пусто"}</div>}
      {view.items.map((h) => {
        const key = `h-${h.id}`;
        return <HandoffRow key={h.id} h={h} busy={actions.busy(key)} error={actions.error(key)}
          onStatus={(s) => actions.run(key, () => updateHandoff(h.id, s))} />;
      })}
      <Pager page={view} onPage={setPage} />
    </Section>
  );
}
