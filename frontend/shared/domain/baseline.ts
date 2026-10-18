// Базовая линия «до ассистента». Посчитано по выгрузкам поликлиники:
// журнал звонков 01.06–31.08.2026 (17 772 звонка),
// история записей 25.03–24.09.2026 (35 470 записей).

export const BASELINE = {
  callsTotal: 17772,
  callsPerDay: 193,
  missedShare: 0.207, // доля пропущенных звонков за всё время
  missedPeakShare: 0.249, // в часы пик 7–10 и 16–18
  avgWaitSec: 22.1,
  avgTalkSec: 123, // средний разговор у отвеченных звонков
  results: { записан: 0.43, справка: 0.276, пропущен: 0.207, перевод: 0.087 },
  visitsTotal: 35470,
  visitsPerDay: 230,
  noShowShare: 0.115,
  cancelShare: 0.122,
};

// Доля пропущенных по часам (7:00 и 20:00–21:00 — регистратура не отвечает вовсе)
export const MISSED_BY_HOUR: { hour: number; calls: number; missed: number }[] = [
  { hour: 7, calls: 357, missed: 1.0 },
  { hour: 8, calls: 1909, missed: 0.212 },
  { hour: 9, calls: 2414, missed: 0.228 },
  { hour: 10, calls: 2073, missed: 0.216 },
  { hour: 11, calls: 1720, missed: 0.114 },
  { hour: 12, calls: 1394, missed: 0.121 },
  { hour: 13, calls: 1138, missed: 0.12 },
  { hour: 14, calls: 1366, missed: 0.121 },
  { hour: 15, calls: 1272, missed: 0.172 },
  { hour: 16, calls: 1242, missed: 0.193 },
  { hour: 17, calls: 1110, missed: 0.18 },
  { hour: 18, calls: 840, missed: 0.181 },
  { hour: 19, calls: 582, missed: 0.163 },
  { hour: 20, calls: 245, missed: 1.0 },
  { hour: 21, calls: 110, missed: 1.0 },
];

export const NOSHOW_BY_SPECIALTY: { name: string; share: number }[] = [
  { name: "Дерматовенеролог", share: 0.164 },
  { name: "Оториноларинголог", share: 0.15 },
  { name: "Уролог", share: 0.139 },
  { name: "Невролог", share: 0.134 },
  { name: "Гастроэнтеролог", share: 0.134 },
  { name: "Травматолог-ортопед", share: 0.128 },
  { name: "Хирург", share: 0.123 },
  { name: "Офтальмолог", share: 0.115 },
  { name: "Терапевт", share: 0.112 },
  { name: "Педиатр", share: 0.093 },
  { name: "Эндокринолог", share: 0.089 },
  { name: "Акушер-гинеколог", share: 0.087 },
  { name: "Кардиолог", share: 0.08 },
];

// Цели из задания поликлиники
export const TARGETS = {
  missedShare: 0.15,
  automatedShare: 0.6,
  waitSec: 30,
  noShowShare: 0.12,
  csat: 4,
};

// Экономический эффект: простые прозрачные формулы, чтобы их можно было проговорить на защите
export function economics() {
  const visitPrice = 1200; // ₽, средняя стоимость приёма по ОМС (из задания)
  const noShowCut = 0.35; // напоминания снижают неявки на 30–40% (берём середину)
  const noShowsPerDay = BASELINE.visitsPerDay * BASELINE.noShowShare;
  const savedVisitsPerDay = noShowsPerDay * noShowCut;
  const rubPerDay = savedVisitsPerDay * visitPrice;

  const answeredPerDay = BASELINE.callsPerDay * (1 - BASELINE.missedShare);
  const automatedPerDay = answeredPerDay * TARGETS.automatedShare;
  const hoursFreedPerDay = (automatedPerDay * BASELINE.avgTalkSec) / 3600;

  return {
    noShowsPerDay,
    savedVisitsPerDay,
    rubPerDay,
    rubPerMonth: rubPerDay * 21, // рабочих дней
    automatedPerDay,
    hoursFreedPerDay,
  };
}
