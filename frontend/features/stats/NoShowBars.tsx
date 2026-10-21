// Полосы: неявки по специальностям (история записей).

import { NOSHOW_BY_SPECIALTY } from "@/shared/domain/baseline";
import { pct } from "./format";

const HIGH = 0.13; // выше — подсвечиваем

export default function NoShowBars() {
  const max = Math.max(...NOSHOW_BY_SPECIALTY.map((s) => s.share));
  return (
    <div className="card">
      <h2>Неявки по специальностям</h2>
      <div className="bars">
        {NOSHOW_BY_SPECIALTY.map((s) => (
          <div className="bar-row" key={s.name}>
            <span>{s.name}</span>
            <div className="bar-track"><div className={`bar-fill ${s.share >= HIGH ? "warn" : ""}`} style={{ width: `${(s.share / max) * 100}%` }} /></div>
            <span className="bar-num">{pct(s.share)}</span>
          </div>
        ))}
      </div>
      <p className="small muted mt">Напоминания в первую очередь отправляем туда, где неявок больше всего.</p>
    </div>
  );
}
