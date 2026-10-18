// Запросы к МИС с кодами ответа: 200/201 — зелёные, остальные — красные.

import { isOkRequest } from "@/shared/domain/standRequests";
import type { StandRequest } from "@/shared/types/staff";

export default function StandLog({ requests }: { requests: StandRequest[] }) {
  if (!requests.length) return null;
  return (
    <div className="stand-log">
      <b>Запросы к стенду «Регистратура»</b>
      {requests.map((s, i) => (
        <div key={i} className="stand-req">
          <span className={`sp ${isOkRequest(s) ? "sp-green" : "sp-red"}`}>{s.status || "нет ответа"}</span>
          <code>{s.method} {s.path}</code>
          {s.note && <small className="muted">{s.note}</small>}
        </div>
      ))}
    </div>
  );
}
