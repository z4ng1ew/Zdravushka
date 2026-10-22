// Строка состояния живого звонка: кто ведёт, таймер, «Перехватить» / «Вернуть ИИ».

import { hms } from "@/shared/domain/dates";
import type { LiveCall } from "@/shared/types/live";
import { HeadsetIcon } from "@/shared/ui/Icons";

function title(call: LiveCall): string {
  if (call.phase === "ended") return "Звонок завершён";
  if (call.mode === "operator") return "Вы на линии с пациентом";
  if (call.mode === "waiting") return "Пациент ждёт регистратора!";
  return "Разговор ведёт ИИ";
}

export default function LiveStatusBar({ call, onTakeover, onRelease }: {
  call: LiveCall; onTakeover: () => void; onRelease: () => void;
}) {
  const active = call.phase === "active";
  return (
    <div className={`live-status ${call.mode}`}>
      <div>
        <span className={`live ${active ? "on" : ""}`}><i /></span>
        <b>{title(call)}</b>
        <span className="timer">{hms(call.seconds)}</span>
      </div>
      <div className="btn-row">
        {call.mode === "operator"
          ? <button className="btn" onClick={onRelease} disabled={!active} data-tip="ИИ продолжит разговор сам">Вернуть ИИ</button>
          : <button className="btn btn-takeover" onClick={onTakeover} disabled={!active} data-tip="ИИ сразу замолчит, пациент услышит вас">
              <HeadsetIcon size={18} /> Перехватить разговор
            </button>}
      </div>
    </div>
  );
}
