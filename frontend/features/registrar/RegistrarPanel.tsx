"use client";

// Панель регистратора — только данные сервера, обновляются каждые 5 секунд:
//   показатели и журнал ← GET /api/calls;  очередь ← /api/handoffs;  обзвон ← /api/reminders.

import { getCalls, getHandoffs, getReminders } from "@/shared/api/staff";
import { POLL } from "@/shared/config";
import { useAction } from "@/shared/hooks/useAction";
import { usePolling } from "@/shared/hooks/usePolling";
import { useToast } from "@/shared/hooks/useToast";
import ErrorCode from "@/shared/ui/ErrorCode";
import Toast from "@/shared/ui/Toast";
import CallsJournal from "./journal/CallsJournal";
import KpiRow from "./KpiRow";
import HandoffQueue from "./queue/HandoffQueue";
import Reminders from "./reminders/Reminders";
import { useUrgentBeep } from "./useUrgentBeep";

const POLL_MS = POLL.registrar;

export default function RegistrarPanel() {
  const calls = usePolling(getCalls, POLL_MS);
  const handoffs = usePolling(getHandoffs, POLL_MS);
  const reminders = usePolling(getReminders, POLL_MS);
  const queueActions = useAction(handoffs.refresh);
  const callActions = useAction(reminders.refresh);
  const { toast, show } = useToast();
  useUrgentBeep(handoffs.data);

  return (
    <>
      <div className="panel-head">
        <h1 className="panel-title">Панель регистратора</h1>
        <span className="panel-sub">Мониторинг звонков и обращений · обновляется каждые {POLL_MS / 1000} с</span>
      </div>
      <KpiRow calls={calls.data ?? []} reminders={reminders.data ?? []} />
      {calls.error && (
        <div className="sec-err"><ErrorCode status={calls.error.status} detail={calls.error.message} /> журнал звонков недоступен</div>
      )}
      <HandoffQueue handoffs={handoffs} actions={queueActions} />
      <Reminders reminders={reminders} actions={callActions} onToast={show} />
      <CallsJournal calls={calls} />
      <Toast text={toast} />
    </>
  );
}
