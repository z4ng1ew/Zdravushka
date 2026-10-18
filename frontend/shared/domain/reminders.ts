// Статусы обзвона (GET /api/reminders): подпись, цвет, подсказка и группа для сводки.
// Новый статус — одна строка в таблице. Жёлтый цвет не используем (решение по дизайну).

export type ReminderGroup = "wait" | "call" | "ok" | "moved" | "cancel" | "miss" | "err" | "other";

export interface ReminderView { text: string; cls: string; tip: string; group: ReminderGroup }

type Rule = Omit<ReminderView, "text"> & { text: string | ((newTime?: string | null) => string) };

const RULES: Record<string, Rule> = {
  "ожидает": { text: "Ожидает звонка", cls: "sp-grey", tip: "Звонок ещё не запускали", group: "wait" },
  "в очереди": { text: "Звоним…", cls: "sp-blue sp-pulse", tip: "Здравушка звонит пациенту", group: "call" },
  "звоним": { text: "Звоним…", cls: "sp-blue sp-pulse", tip: "Здравушка звонит пациенту", group: "call" },
  "подтвердил": { text: "Придёт", cls: "sp-green", tip: "Пациент подтвердил приём", group: "ok" },
  "перенес": {
    text: (t) => (t ? `Перенёс на ${t}` : "Перенёс"), cls: "sp-violet", tip: "Запись перенесена в МИС", group: "moved",
  },
  "отменил": { text: "Отменил — слот свободен", cls: "sp-orange", tip: "Запись отменена в МИС, время ушло другим пациентам", group: "cancel" },
  "не дозвонились": { text: "Не дозвонились", cls: "sp-rose", tip: "Пациент не взял трубку — можно позвонить ещё раз", group: "miss" },
  "без ответа": { text: "Не дозвонились", cls: "sp-rose", tip: "Пациент не ответил — можно позвонить ещё раз", group: "miss" },
  "не ответил": { text: "Не дозвонились", cls: "sp-rose", tip: "Пациент не ответил — можно позвонить ещё раз", group: "miss" },
  "ошибка звонка": { text: "Ошибка телефонии", cls: "sp-red", tip: "Телефония не смогла совершить вызов", group: "err" },
};

const key = (s: string) => (s || "").trim().toLowerCase().replace("ё", "е");

export function reminderView(status: string, newTime?: string | null): ReminderView {
  const rule = RULES[key(status)];
  if (!rule) return { text: status || "—", cls: "sp-grey", tip: "Статус от сервера", group: "other" };
  return { ...rule, text: typeof rule.text === "function" ? rule.text(newTime) : rule.text };
}
