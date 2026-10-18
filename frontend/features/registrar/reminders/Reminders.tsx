"use client";

// Раздел «Исходящий обзвон»: напоминания о приёме на ближайший рабочий день (GET /api/reminders),
// «Обзвонить всех» (POST /api/reminders/run) и «Позвонить» у строки (POST /api/reminders/{visit_id}/call).

import { useMemo } from "react";
import { callReminder, runReminders } from "@/shared/api/staff";
import { splitDT } from "@/shared/domain/dates";
import type { Actions } from "@/shared/hooks/useAction";
import type { Polled } from "@/shared/hooks/usePolling";
import type { Reminder } from "@/shared/types/staff";
import { ErrorInline } from "@/shared/ui/ErrorCode";
import { IPhoneOut } from "@/shared/ui/NavIcons";
import Section from "@/shared/ui/Section";
import Spinner from "@/shared/ui/Spinner";
import ReminderRow from "./ReminderRow";
import ReminderSummary from "./ReminderSummary";

const runText = (r: { queued?: number; note?: string }) =>
  r.note ?? (typeof r.queued === "number" ? `В очереди: ${r.queued}` : "Обзвон запущен");

export default function Reminders({ reminders, actions, onToast }: {
  reminders: Polled<Reminder[]>; actions: Actions; onToast: (t: string) => void;
}) {
  const list = useMemo(() => [...(reminders.data ?? [])].sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at)), [reminders.data]);
  const day = list[0] ? splitDT(list[0].scheduled_at).date : "";
  const canRun = list.some((r) => r.status === "ожидает");
  const runBtn = (
    <button className="sec-btn" disabled={actions.busy("run") || !canRun} data-tip-pos="bottom"
      onClick={() => actions.run("run", runReminders, (r) => onToast(runText(r)))}
      data-tip={canRun ? "Здравушка позвонит всем, кто ещё ждёт напоминания" : "Всем уже звонили"}>
      {actions.busy("run") ? <><Spinner /> Запускаю…</> : "📞 Обзвонить всех"}
    </button>
  );
  const err = reminders.error ?? actions.error("run");

  return (
    <Section tone="teal" icon={<IPhoneOut size={24} />} title="Исходящий обзвон"
      badge={<span className="sec-hint">{day ? `приёмы на ${day}` : "приёмы на завтра"}</span>}
      right={<>{err && <ErrorInline status={err.status} detail={err.message} />}{runBtn}</>}>
      <ReminderSummary list={list} />
      <table className="t2">
        <thead><tr><th>Пациент</th><th>Врач</th><th>Время приёма</th><th>Статус</th><th></th></tr></thead>
        <tbody>
          {reminders.data === null && <tr><td colSpan={5} className="empty-row">Загружаю…</td></tr>}
          {reminders.data?.length === 0 && <tr><td colSpan={5} className="empty-row">Пусто</td></tr>}
          {list.map((r) => {
            const key = `r-${r.visit_id}`;
            return <ReminderRow key={r.visit_id} r={r} busy={actions.busy(key)} error={actions.error(key)}
              onCall={() => actions.run(key, () => callReminder(r.visit_id))} />;
          })}
        </tbody>
      </table>
    </Section>
  );
}
