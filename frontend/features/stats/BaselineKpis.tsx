// Показатели регистратуры «до ассистента» и цели пилота (источник — shared/domain/baseline.ts).

import { BASELINE, TARGETS } from "@/shared/domain/baseline";
import { dec, num, pct } from "./format";
import StatCard from "./StatCard";

export default function BaselineKpis() {
  return (
    <div className="grid grid-4">
      <StatCard label="Пропущенные звонки" value={pct(BASELINE.missedShare)}
        tip="Доля звонков, на которые никто не ответил. Часы пик: 7–10 и 16–18. Источник — журнал звонков за 3 месяца."
        hint={<>в часы пик <b>{pct(BASELINE.missedPeakShare)}</b> · цель ≤ <b>{pct(TARGETS.missedShare)}</b></>} />
      <StatCard label="Неявки на приём" value={pct(BASELINE.noShowShare)}
        tip="Записанные пациенты, которые не пришли. Напоминание за день до визита снижает неявки на 30–40%."
        hint={<>ещё <b>{pct(BASELINE.cancelShare)}</b> отмен · цель: −30–40% неявок</>} />
      <StatCard label="Ожидание на линии" value={`${dec(BASELINE.avgWaitSec)} с`}
        tip="Среднее время от звонка до ответа. ИИ отвечает сразу, без очереди."
        hint={<>в среднем · цель ≤ <b>{TARGETS.waitSec} с</b></>} />
      <StatCard label="Звонков в день" value={num(BASELINE.callsPerDay)}
        tip="Около 60% обращений типовые: запись, перенос, отмена, справки. Их ИИ закрывает сам."
        hint={<>цель: ≥ <b>{pct(TARGETS.automatedShare)}</b> типовых без оператора</>} />
    </div>
  );
}
