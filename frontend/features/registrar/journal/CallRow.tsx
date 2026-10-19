"use client";

// Строка журнала звонков; по нажатию — разговор и запросы к МИС с кодами ответа.

import { useState } from "react";
import { durationText, splitDT, todayKey } from "@/shared/domain/dates";
import { intentLabel } from "@/shared/domain/intents";
import { failedRequests } from "@/shared/domain/standRequests";
import type { Call } from "@/shared/types/staff";
import StandLog from "@/shared/ui/StandLog";
import { toggleRow } from "@/shared/ui/toggleRow";
import Transcript from "@/shared/ui/Transcript";
import { flagLabels, resultView } from "./journalView";

const COLS = 7;

function Direction({ out }: { out: boolean }) {
  return out
    ? <span className="dir dir-out" data-tip="Исходящий — напоминание о приёме">↗ исходящий</span>
    : <span className="dir dir-in" data-tip="Входящий звонок пациента">↙ входящий</span>;
}

function MisCount({ c }: { c: Call }) {
  if (!c.stand_requests.length) return <span className="muted">—</span>;
  const bad = failedRequests(c.stand_requests).length;
  return <span className={`sp ${bad ? "sp-red" : "sp-green"}`}>{c.stand_requests.length}{bad ? `, ошибок ${bad}` : ""}</span>;
}

export default function CallRow({ c }: { c: Call }) {
  const [open, setOpen] = useState(false);
  const at = splitDT(c.started_at);
  const res = resultView(c.result);
  const flags = flagLabels(c);
  return (
    <>
      <tr {...toggleRow(open, () => setOpen(!open))} data-tip="Нажмите, чтобы увидеть разговор">
        <td>{at.time} <small className="muted">{at.date === todayKey() ? "" : at.date}</small></td>
        <td><Direction out={c.direction === "исходящий"} /></td>
        <td>{c.patient || <span className="muted">не назвался</span>}</td>
        <td><span className={res.cls}>{res.text}</span>
          {flags.map((f) => <span key={f} className="call-flag" data-tip="Отметка сервера: фраза пациента похожа на попытку изменить поведение ИИ.">{f}</span>)}
        </td>
        <td>{intentLabel(c.intent)}</td>
        <td>{durationText(c.duration_sec)}</td>
        <td><MisCount c={c} /></td>
      </tr>
      {open && (
        <tr className="tr-detail"><td colSpan={COLS}>
          <div className="call-detail">
            <Transcript items={c.transcript} />
            <StandLog requests={c.stand_requests} />
          </div>
        </td></tr>
      )}
    </>
  );
}
