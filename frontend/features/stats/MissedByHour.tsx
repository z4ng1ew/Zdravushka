// Столбики: доля пропущенных звонков по часам (выгрузка журнала звонков).

import { MISSED_BY_HOUR } from "@/shared/domain/baseline";
import { num, pct } from "./format";

const PEAK = [8, 9, 16, 17];
const LEGEND = [["#f0612a", "часы пик"], ["#e03a48", "регистратура не отвечает"], ["#1f6cf0", "обычные часы"]];

export default function MissedByHour() {
  return (
    <div className="card">
      <h2>Доля пропущенных звонков по часам</h2>
      <div className="columns">
        {MISSED_BY_HOUR.map((h) => (
          <div className="column" key={h.hour} title={`${h.hour}:00 — ${h.calls} звонков, пропущено ${pct(h.missed)}`}>
            <span className="column-value">{Math.round(h.missed * 100)}</span>
            <div className={`column-fill ${h.missed >= 1 ? "closed" : PEAK.includes(h.hour) ? "peak" : ""}`}
              style={{ height: `${Math.max(h.missed * 100, 2)}%` }} />
            <span className="column-label">{h.hour}</span>
          </div>
        ))}
      </div>
      <div className="legend">{LEGEND.map(([c, t]) => <span key={t}><i style={{ background: c }} />{t}</span>)}</div>
      <p className="small muted mt">
        В 7:00 и после 20:00 не отвечает никто — это {num(357 + 245 + 110)} звонков за 3 месяца. Ассистент закрывает эти часы полностью.
      </p>
    </div>
  );
}
