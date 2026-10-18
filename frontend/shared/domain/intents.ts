// Подписи целей звонка (intent из /api/chat и /api/calls). Новое значение — одна строка здесь.

const INTENT_LABEL: Record<string, string> = {
  booking: "Запись к врачу",
  reschedule: "Перенос записи",
  cancel: "Отмена записи",
  status: "Статус записи",
  schedule_info: "График врача",
  reminder: "Напоминание",
  info: "Справка",
  home_visit: "Вызов на дом",
  escalation: "Передано сотруднику",
};

/** Подпись намерения; неизвестное значение показываем как есть */
export const intentLabel = (intent: string | null | undefined): string =>
  intent ? INTENT_LABEL[intent] ?? intent : "—";
