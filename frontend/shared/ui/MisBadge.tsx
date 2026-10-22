"use client";

// Плашка режима МИС в шапке — коротко; подробности (152-ФЗ, «без нейросети») во всплывающей подсказке.
// Тексты и правила — shared/domain/misMode.ts.

import { misExtras, misView } from "@/shared/domain/misMode";
import { useHealth, type HealthState } from "@/shared/hooks/useHealth";

export default function MisBadge({ health: { data, error } }: { health: HealthState }) {
  if (error) {
    return (
      <span className="mis-badge mis-off" tabIndex={0} data-tip="Сервер не отвечает — подробности в журнале ошибок" data-tip-pos="bottom">
        <i />Сервер недоступен
      </span>
    );
  }
  if (!data) return null;
  const view = misView(data);
  const lines = [view.tip, ...misExtras(data)];
  return (
    <span className={`mis-badge ${view.cls}`} tabIndex={0} data-tip={lines.join("\n")} data-tip-pos="bottom"
      aria-label={[view.text, ...lines].join(". ")}>
      <i />{view.text}{data.pd_trusted_ai_only && <span className="mis-lock" aria-hidden="true">🔒</span>}
    </span>
  );
}

/** Плашка, которая сама опрашивает /api/health — для шапки кабинетов */
export function MisBadgeAuto() {
  return <MisBadge health={useHealth()} />;
}
