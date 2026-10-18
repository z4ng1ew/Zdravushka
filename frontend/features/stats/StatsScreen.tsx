// «Статистика»: живые цифры пилота и аналитика «до ассистента» по выгрузкам поликлиники.

import BaselineKpis from "./BaselineKpis";
import Economics from "./Economics";
import MissedByHour from "./MissedByHour";
import NoShowBars from "./NoShowBars";
import PilotNow from "./PilotNow";

export default function StatsScreen() {
  return (
    <>
      <h1 className="page-title">Статистика</h1>
      <p className="page-sub">
        Вверху — живые цифры пилота с сервера. Ниже — аналитика «до ассистента»
        <b> по выгрузкам поликлиники за июнь–август 2026</b> (журнал звонков, 17 772 звонка) и истории записей
        за 25.03–24.09.2026 (35 470 записей); источник чисел — <code>shared/domain/baseline.ts</code>.
      </p>
      <PilotNow />
      <BaselineKpis />
      <div className="grid grid-2 mt"><MissedByHour /><NoShowBars /></div>
      <Economics />
    </>
  );
}
