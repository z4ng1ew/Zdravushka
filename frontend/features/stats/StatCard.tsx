// Карточка показателя дашборда: подпись (с подсказкой «i»), значение и пояснение.

import type { ReactNode } from "react";

export default function StatCard({ label, tip, value, hint, pilot, bare }: {
  label: string; tip?: string; value: ReactNode; hint: ReactNode;
  pilot?: boolean; // живые цифры пилота — с рамкой
  bare?: boolean; // без карточки (внутри другой карточки)
}) {
  return (
    <div className={bare ? undefined : `card ${pilot ? "card-pilot" : ""}`}>
      <div className="kpi-label">{label} {tip && <span className="info" tabIndex={0} data-tip={tip}>i</span>}</div>
      <div className="kpi-value">{value}</div>
      <div className="kpi-hint">{hint}</div>
    </div>
  );
}
