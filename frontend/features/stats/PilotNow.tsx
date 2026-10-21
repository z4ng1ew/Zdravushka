"use client";

// «Пилот сейчас»: живые цифры из журнала Здравушки рядом с исходными показателями регистратуры.

import { getCalls, getReminders } from "@/shared/api/staff";
import { usePolling } from "@/shared/hooks/usePolling";
import ErrorCode from "@/shared/ui/ErrorCode";
import { share } from "./format";
import { pilotStats } from "./pilotStats";
import StatCard from "./StatCard";

const MINUTE = 60_000;

export default function PilotNow() {
  const calls = usePolling(getCalls, MINUTE);
  const reminders = usePolling(getReminders, MINUTE);
  if (calls.error) {
    return <div className="card"><div className="kpi-label">Пилот сейчас</div><ErrorCode status={calls.error.status} detail={calls.error.message} /></div>;
  }
  if (!calls.data) return null;
  const p = pilotStats(calls.data, reminders.data ?? []);
  return (
    <div className="grid grid-4 pilot-now">
      <StatCard pilot label="Пилот: звонков" tip="Разговоры со Здравушкой из журнала сервера (где пациент хоть что-то сказал)."
        value={p.total} hint="ответ сразу, без ожидания на линии" />
      <StatCard pilot label="Решено без оператора" value={share(p.solved, p.total)}
        hint={<>{p.solved} из {p.total} · из них записей <b>{p.booked}</b></>} />
      <StatCard pilot label="Передано регистратору" value={share(p.passed, p.total)} hint="с готовым резюме — без повторных вопросов" />
      <StatCard pilot label="Средний разговор" value={`${p.avgSec} с`}
        hint={<>напоминаний с ответом: <b>{p.reached}</b> из {p.reminders}</>} />
    </div>
  );
}
