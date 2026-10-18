// Перевод на регистратора: правило регламента, причина, приоритет и что передано.

import type { ChatEscalation } from "@/shared/types/chat";
import { HeadsetIcon } from "@/shared/ui/Icons";

export default function HandoffCard({ escalation: e, operatorOnLine }: { escalation: ChatEscalation; operatorOnLine: boolean }) {
  return (
    <div className="record">
      {e.emergency && (
        <div className="emergency emergency-card"><b>Угроза жизни — 103 / 112</b><span>Не ждите записи к врачу.</span></div>
      )}
      <div className={`result ${operatorOnLine ? "result-op" : "result-warn"}`}>
        <span className="ok-ico"><HeadsetIcon size={22} /></span>
        <div>
          <b>{operatorOnLine ? "Разговор ведёт регистратор" : "Передано регистратору"}</b>
          <dl className="esc-kv">
            <dt>Правило</dt><dd>{e.rule || "—"}</dd>
            <dt>Причина</dt><dd>{e.reason || "—"}</dd>
            <dt>Приоритет</dt><dd>{e.priority || "—"}</dd>
            <dt>Передано</dt><dd>{e.summary || "—"}</dd>
          </dl>
        </div>
      </div>
    </div>
  );
}
