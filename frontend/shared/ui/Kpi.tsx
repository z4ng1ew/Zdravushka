import type { ReactNode } from "react";

/** Карточка показателя с круглой иконкой, заходящей на левый край (как в макете). */
export default function Kpi({ icon, title, value, delta, sub, tip }: {
  icon: ReactNode; title: string; value: ReactNode; delta?: number | null; sub?: string; tip?: string;
}) {
  return (
    <div className="kpi2" data-tip={tip}>
      <span className="kpi2-ico">{icon}</span>
      <div className="kpi2-title">{title}</div>
      <div className="kpi2-row">
        <b className="kpi2-value">{value}</b>
        {delta != null && (
          <span className={`kpi2-delta ${delta >= 0 ? "up" : "down"}`}>{delta >= 0 ? "↑" : "↓"}{delta >= 0 ? "+" : ""}{delta}%</span>
        )}
        {sub && <span className="kpi2-sub">{sub}</span>}
      </div>
    </div>
  );
}
