// Экономический эффект пилота (оценка по выгрузкам поликлиники).

import { BASELINE, economics } from "@/shared/domain/baseline";
import { dec, num } from "./format";
import StatCard from "./StatCard";

export default function Economics() {
  const e = economics();
  return (
    <div className="card mt">
      <h2>Экономический эффект пилота (оценка)</h2>
      <div className="grid grid-4">
        <StatCard bare label="Возвращённых приёмов в день" tip="Неявки в день × 35% (эффект напоминаний)."
          value={`≈ ${dec(e.savedVisitsPerDay)}`} hint={`${dec(e.noShowsPerDay)} неявок/день × 35%`} />
        <StatCard bare label="Экономия на неявках" tip="Возвращённые приёмы × 1 200 ₽ (средняя стоимость приёма по ОМС) × 21 рабочий день."
          value={`≈ ${num(e.rubPerMonth / 1000)} тыс. ₽`} hint={`в месяц · ${num(e.rubPerDay)} ₽/день по 1 200 ₽ за приём`} />
        <StatCard bare label="Звонков без оператора" tip="Отвеченные звонки в день × 60% типовых обращений."
          value={`≈ ${num(e.automatedPerDay)}`} hint="в день при 60% автоматизации" />
        <StatCard bare label="Высвобождено времени" tip="Звонки без оператора × средняя длительность разговора (123 с)."
          value={`≈ ${dec(e.hoursFreedPerDay)} ч`} hint={`регистраторов в день (разговор ~${BASELINE.avgTalkSec} с)`} />
      </div>
      <p className="small muted mt">
        Источник: журнал звонков 01.06–31.08.2026 ({num(BASELINE.callsTotal)} звонков) и история записей
        25.03–24.09.2026 ({num(BASELINE.visitsTotal)} записей).
      </p>
    </div>
  );
}
