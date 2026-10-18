// Запись на приём (до выдачи талона): врач, дата, время, «когда», статус и номер записи в МИС.

import type { UiBooking } from "@/shared/types/chat";
import { CalendarIcon, CheckCircle, ClockIcon } from "@/shared/ui/Icons";

const RESULT_CLS: Record<UiBooking["kind"], string> = { pending: "result-warn", cancelled: "result-off", booked: "result-ok" };

export default function BookingCard({ booking: b }: { booking: UiBooking }) {
  return (
    <div className="record">
      <div className="doctor-head">
        <img src="/img/mascot-ticket.png" width={88} height={88} alt="" />
        <div className="doctor-name"><b>{b.doctor}</b><span>{b.specialty}</span></div>
      </div>
      <div className="record-grid">
        <div><CalendarIcon /><small>Дата</small><div>{b.date || "—"}</div></div>
        <div><ClockIcon /><small>Время</small><div>{b.time || "—"}</div></div>
      </div>
      <dl className="esc-kv rec-kv">
        {b.spoken && (<><dt>Когда</dt><dd>{b.spoken}</dd></>)}
        <dt>Статус</dt><dd>{b.statusText}</dd>
        <dt>№ записи</dt><dd>{b.visitId ?? "—"}</dd>
      </dl>
      <div className={`result ${RESULT_CLS[b.kind]}`}>
        <span className="ok-ico">{b.kind === "booked" ? <CheckCircle size={22} /> : <ClockIcon size={22} />}</span>
        <div><b>{b.title}</b><div>{b.note}</div></div>
      </div>
    </div>
  );
}
