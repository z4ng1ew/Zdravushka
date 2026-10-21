// Кнопки статуса перевода: новая → в работе → перезвонили → закрыта (и «Вернуть»).

import type { Handoff, HandoffStatus } from "@/shared/types/staff";

interface Step { label: string; to: HandoffStatus; cls: string; tip?: string }

/** Какие кнопки показывать для каждого статуса */
const STEPS: Record<HandoffStatus, Step[]> = {
  "новая": [{ label: "Взять в работу", to: "в работе", cls: "btn-work" }],
  "в работе": [
    { label: "Перезвонили", to: "перезвонили", cls: "btn-work btn-work-done", tip: "Регистратор связался с пациентом" },
    { label: "Закрыть", to: "закрыта", cls: "btn-work btn-work-ghost" },
  ],
  "перезвонили": [{ label: "Закрыть", to: "закрыта", cls: "btn-work btn-work-ghost" }],
  "закрыта": [{ label: "Вернуть", to: "в работе", cls: "btn-work btn-work-ghost" }],
};

export default function HandoffActions({ handoff, busy, onStatus }: {
  handoff: Handoff; busy: boolean; onStatus: (s: HandoffStatus) => void;
}) {
  return (
    <>
      {(STEPS[handoff.status] ?? []).map((s) => (
        <button key={s.to} className={s.cls} disabled={busy} onClick={() => onStatus(s.to)} data-tip={s.tip}>{s.label}</button>
      ))}
    </>
  );
}
