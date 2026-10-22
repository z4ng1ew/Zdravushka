// Пункты меню плашки пользователя — в одном месте для всех экранов.

import type { ChipMenuItem } from "./UserChip";

export type PatientPage = "call" | "tickets";

export const patientMenu = (active: PatientPage): ChipMenuItem[] => [
  { label: "Позвонить в регистратуру", hint: "голосовой помощник", href: "/", active: active === "call" },
  { label: "Мои талоны", hint: "куда и когда записаны", href: "/tickets/", active: active === "tickets" },
  { label: "Регистратор", hint: "для сотрудников", href: "/staff/" },
];

export const staffMenu: ChipMenuItem[] = [
  { label: "Регистратор", hint: "панель регистратуры", href: "/staff/", active: true },
  { label: "Пациент", hint: "звонок в регистратуру", href: "/" },
];
