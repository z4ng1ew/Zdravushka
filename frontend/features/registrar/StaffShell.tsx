"use client";

// Каркас кабинета регистратора: пункты левого меню и плашка сотрудника.

import type { ReactNode } from "react";
import { staffMenu } from "@/shared/ui/menus";
import { IAlertCircle, IHome, NCalendar, NChat, NSettings, NStats, NUsers } from "@/shared/ui/NavIcons";
import Shell, { type NavItem } from "@/shared/ui/Shell";
import UserChip from "@/shared/ui/UserChip";

const NAV: NavItem[] = [
  { href: "/staff/", label: "Регистратура", icon: <IHome /> },
  { href: "/staff/live/", label: "Диалоги", icon: <NChat /> },
  { href: "/staff/schedule/", label: "Расписание", icon: <NCalendar /> },
  { href: "/staff/patients/", label: "Пациенты", icon: <NUsers /> },
  { href: "/staff/stats/", label: "Статистика", icon: <NStats /> },
  { href: "/staff/errors/", label: "Ошибки", icon: <IAlertCircle size={22} /> },
  { href: "/staff/settings/", label: "Настройки", icon: <NSettings /> },
];

export default function StaffShell({ children }: { children: ReactNode }) {
  return (
    <Shell nav={NAV} chip={<UserChip name="Регистратура" role="Сотрудник" avatar="/img/avatar-staff.png" items={staffMenu} />}>
      {children}
    </Shell>
  );
}
