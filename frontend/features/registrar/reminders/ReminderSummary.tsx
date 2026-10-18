// Сводка обзвона: «Придут · Перенесли · Отменили · Не дозвонились» — метрика неявок из кейса.

import { reminderView, type ReminderGroup } from "@/shared/domain/reminders";
import type { Reminder } from "@/shared/types/staff";

const ITEMS: { group: ReminderGroup; label: string; cls: string; hideZero?: boolean }[] = [
  { group: "ok", label: "Придут", cls: "sp-green" },
  { group: "moved", label: "Перенесли", cls: "sp-violet" },
  { group: "cancel", label: "Отменили", cls: "sp-orange" },
  { group: "miss", label: "Не дозвонились", cls: "sp-rose" },
  { group: "err", label: "Ошибка телефонии", cls: "sp-red", hideZero: true },
];

export default function ReminderSummary({ list }: { list: Reminder[] }) {
  if (!list.length) return null;
  const count = (g: ReminderGroup) => list.filter((r) => reminderView(r.status).group === g).length;
  return (
    <div className="rem-summary" aria-label="Итоги обзвона">
      {ITEMS.filter((i) => !i.hideZero || count(i.group) > 0).map((i) => (
        <span key={i.group} className={`sp ${i.cls}`}>{i.label}: {count(i.group)}</span>
      ))}
    </div>
  );
}
