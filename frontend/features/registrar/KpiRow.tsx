// Показатели дня: звонки, решено без оператора, передано, напоминания (из /api/calls и /api/reminders).

import { dayKpi, shareText } from "@/shared/domain/callStats";
import { splitDT } from "@/shared/domain/dates";
import type { Call, Reminder } from "@/shared/types/staff";
import Kpi from "@/shared/ui/Kpi";
import { IBell, ICheck, IHeadset, IPhoneWave } from "@/shared/ui/NavIcons";

export default function KpiRow({ calls, reminders }: { calls: Call[]; reminders: Reminder[] }) {
  const k = dayKpi(calls, reminders);
  const day = reminders[0] ? splitDT(reminders[0].scheduled_at).date : "";
  return (
    <div className="kpi-grid">
      <Kpi icon={<IPhoneWave size={24} />} title="Звонков принято Здравушкой" value={k.total} delta={k.totalD} sub="сегодня"
        tip="Все звонки (голос и чат), которые принял голосовой помощник за сегодня. Процент — изменение ко вчера." />
      <Kpi icon={<ICheck size={24} />} title="Решено без оператора" value={k.solved} delta={k.solvedD} sub={shareText(k.solved, k.total)}
        tip="Звонки, которые Здравушка довёл до конца сам: запись, перенос, отмена, справка." />
      <Kpi icon={<IHeadset size={24} />} title="Передано регистратору" value={k.passed} delta={k.passedD} sub={shareText(k.passed, k.total)}
        tip="Неотложные состояния, жалобы, медицинские вопросы, вызов на дом и просьбы позвать человека." />
      <Kpi icon={<IBell size={24} />} title="Напоминаний отправлено" value={k.sent}
        sub={k.remindTotal ? `из ${k.remindTotal}${day ? ` на ${day}` : ""}` : "пусто"}
        tip="Пациенты с приёмом на ближайший рабочий день, которым Здравушка уже позвонил." />
    </div>
  );
}
