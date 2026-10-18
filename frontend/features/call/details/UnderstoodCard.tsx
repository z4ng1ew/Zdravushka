// «Что понял Здравушка»: намерение и собранные поля (collected).

import { intentLabel } from "@/shared/domain/intents";
import { CheckCircle } from "@/shared/ui/Icons";
import { IChevron } from "@/shared/ui/NavIcons";

export default function UnderstoodCard({ intent, fields }: { intent: string | null; fields: Record<string, string> }) {
  const entries = Object.entries(fields);
  return (
    <div className="understood">
      <div className="intent-bar">
        <span>Намерение</span>
        <b><IChevron /> {intentLabel(intent)}</b>
      </div>
      <ul className="facts">
        {entries.length === 0 && <li className="facts-empty">Пусто</li>}
        {entries.map(([k, v]) => (
          <li key={k}>
            <span className="ok-ico"><CheckCircle /></span>
            <div><small>{k}</small><div>{v}</div></div>
          </li>
        ))}
      </ul>
    </div>
  );
}
