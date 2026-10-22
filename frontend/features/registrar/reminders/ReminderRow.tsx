// Строка обзвона: пациент, врач, время, цветной статус и кнопка «Позвонить».

import type { ApiError } from "@/shared/api/ApiError";
import { splitDT } from "@/shared/domain/dates";
import { shortName } from "@/shared/domain/doctors";
import { reminderView } from "@/shared/domain/reminders";
import type { Reminder } from "@/shared/types/staff";
import { ErrorInline } from "@/shared/ui/ErrorCode";
import Spinner from "@/shared/ui/Spinner";

export default function ReminderRow({ r, busy, error, onCall }: {
  r: Reminder; busy: boolean; error: ApiError | null; onCall: () => void;
}) {
  const v = reminderView(r.status, r.new_time);
  const at = splitDT(r.scheduled_at);
  return (
    <tr>
      <td>{r.patient}</td>
      <td>{r.specialty} {shortName(r.doctor)}</td>
      <td>{at.time} <small className="muted">{at.date}</small></td>
      <td><span className={`sp ${v.cls}`} data-tip={v.tip}>{v.text}</span></td>
      <td className="td-act">
        {error && <ErrorInline status={error.status} detail={error.message} />}
        <button className="btn-mini" disabled={busy || v.group === "call"} onClick={onCall}
          aria-label={`Позвонить: ${r.patient}`} data-tip="ИИ позвонит этому пациенту сейчас">
          {busy ? <><Spinner /> Звоню…</> : "Позвонить"}
        </button>
      </td>
    </tr>
  );
}
