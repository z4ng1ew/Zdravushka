"use client";

// Строка очереди переводов и раскрывающийся разговор (что пациент уже сказал ИИ).

import Link from "next/link";
import { useState } from "react";
import type { ApiError } from "@/shared/api/ApiError";
import { agoMis, splitDT } from "@/shared/domain/dates";
import type { Handoff, HandoffStatus } from "@/shared/types/staff";
import { ErrorInline } from "@/shared/ui/ErrorCode";
import Transcript from "@/shared/ui/Transcript";
import HandoffActions from "./HandoffActions";
import { reasonStyle, STATUS_CLS } from "./handoffView";
import { handoffPatient } from "./queueRules";

function Details({ h }: { h: Handoff }) {
  const facts = Object.entries(h.collected);
  return (
    <div className="q-detail">
      {facts.length > 0 && (
        <div className="q-facts">{facts.map(([k, v]) => <span key={k} className="fact-chip"><small>{k}</small>{v}</span>)}</div>
      )}
      <Transcript items={h.transcript} />
      <Link href="/staff/live/" className="btn-mini" data-tip="Если звонок ещё идёт — перехватить разговор">Открыть живой звонок</Link>
    </div>
  );
}

export default function HandoffRow({ h, busy, error, onStatus }: {
  h: Handoff; busy: boolean; error: ApiError | null; onStatus: (s: HandoffStatus) => void;
}) {
  const [open, setOpen] = useState(false);
  const reason = reasonStyle(h.reason, h.urgent);
  return (
    <>
      <div className={`q-row ${h.urgent ? "q-red" : ""} ${h.status !== "новая" ? "q-work" : ""}`}>
        <div className="q-time"><b>{splitDT(h.created_at).time}</b><small>{agoMis(h.created_at)}</small></div>
        <div className="q-tags">
          <span className={`rtag ${reason.cls}`}>{reason.icon}{h.reason || "причина не указана"}</span>
          <div className="q-status"><span className={`sp ${STATUS_CLS[h.status] ?? "sp-grey"}`}>{h.status}</span></div>
        </div>
        <div className="q-patient">
          <div><b>Пациент:</b> {handoffPatient(h) || "не назвался"}</div>
          <div><b>Дата рождения:</b> {h.collected["дата рождения"] || "—"}</div>
          <div><b>Телефон:</b> {h.phone || "—"}</div>
        </div>
        <div className="q-summary">{h.summary}</div>
        <div className="q-act">
          {error && <ErrorInline status={error.status} detail={error.message} />}
          <HandoffActions handoff={h} busy={busy} onStatus={onStatus} />
          <button className="btn-mini" onClick={() => setOpen(!open)}
            data-tip="Что пациент уже сказал ИИ — переспрашивать не нужно">{open ? "Скрыть" : "Разговор"}</button>
        </div>
      </div>
      {open && <Details h={h} />}
    </>
  );
}
