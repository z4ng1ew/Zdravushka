"use client";

// «Сбои МИС в звонках» — с сервера (GET /api/calls), обновляется раз в 10 секунд.

import { POLL } from "@/shared/config";
import { Fragment, useState } from "react";
import { getCalls } from "@/shared/api/staff";
import { failedRequests, isMisFailure } from "@/shared/domain/standRequests";
import { usePolling } from "@/shared/hooks/usePolling";
import type { Call } from "@/shared/types/staff";
import { ErrorInline } from "@/shared/ui/ErrorCode";
import { toggleRow } from "@/shared/ui/toggleRow";
import Transcript from "@/shared/ui/Transcript";

const loadFailures = () => getCalls().then((l) => l.filter(isMisFailure));

function FailedRequests({ c }: { c: Call }) {
  const bad = failedRequests(c.stand_requests);
  if (!bad.length) return <span className="muted">переведён из-за сбоя</span>;
  return <>{bad.map((r, i) => (
    <div key={i}><span className="sp sp-red">{r.status || "нет ответа"}</span> <span className="mono">{r.method} {r.path}</span>{r.note ? ` — ${r.note}` : ""}</div>
  ))}</>;
}

export default function MisFailures() {
  const { data, error } = usePolling(loadFailures, POLL.misFailures);
  const [open, setOpen] = useState<string | null>(null);
  if (error) return <ErrorInline status={error.status} detail={error.message} />;
  if (data === null) return <div className="card live-empty">Загружаю…</div>;
  if (!data.length) return <div className="card live-empty"><b>Пусто</b></div>;
  return (
    <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 22 }}>
      <table>
        <thead><tr><th>Время</th><th>Пациент</th><th>Итог</th><th>Запросы к МИС с ошибкой</th></tr></thead>
        <tbody>
          {data.map((c) => (
            <Fragment key={c.id}>
              <tr {...toggleRow(open === c.id, () => setOpen(open === c.id ? null : c.id))}>
                <td className="small">{c.started_at}</td>
                <td>{c.patient || <span className="muted">не назвался</span>}</td>
                <td className="small">{c.result}</td>
                <td className="small"><FailedRequests c={c} /></td>
              </tr>
              {open === c.id && <tr><td colSpan={4} style={{ background: "rgba(232,241,255,.5)" }}><Transcript items={c.transcript} /></td></tr>}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
