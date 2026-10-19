// Телефонный звонок, который идёт сейчас: кто звонит, цель, расшифровка и запросы к МИС.
// Перехвата нет — по телефону сервер его пока не поддерживает; есть переход к очереди переводов.

import Link from "next/link";
import { durationText } from "@/shared/domain/dates";
import { intentLabel } from "@/shared/domain/intents";
import type { Call } from "@/shared/types/staff";
import StandLog from "@/shared/ui/StandLog";
import Transcript from "@/shared/ui/Transcript";

export default function PhoneCallCard({ call }: { call: Call }) {
  return (
    <div className="card phone-call">
      <div className="live-status ai">
        <div>
          <span className="live on"><i /></span>
          <b>📞 Телефон · {call.direction} · {durationText(call.duration_sec)}</b>
        </div>
        <Link href="/staff/" className="btn" data-tip="Если ИИ передаст звонок, обращение появится в очереди">
          Открыть очередь переводов
        </Link>
      </div>
      <p className="small muted phone-call-meta">
        {intentLabel(call.intent)}{call.patient ? ` · ${call.patient}` : ""} · начат {call.started_at}
      </p>
      <Transcript items={call.transcript} />
      <StandLog requests={call.stand_requests} />
    </div>
  );
}
