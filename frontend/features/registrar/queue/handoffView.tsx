// Очередь переводов — вид: значок и цвет причины, цвет статуса.

import type { ReactNode } from "react";
import type { HandoffStatus } from "@/shared/types/staff";
import { IAlert, IAlertCircle, IBell, IHeadset, IMegaphone, IQuestion } from "@/shared/ui/NavIcons";

/** Причина → цвет и значок (первое совпадение сверху) */
const REASONS: { test: (r: string, urgent: boolean) => boolean; cls: string; icon: ReactNode }[] = [
  { test: (r, u) => u || r.includes("неотлож") || r.includes("остр"), cls: "rt-red", icon: <IAlert /> },
  { test: (r) => r.includes("жалоб"), cls: "rt-red", icon: <IAlertCircle /> },
  { test: (r) => r.includes("мед"), cls: "rt-blue", icon: <IMegaphone /> },
  { test: (r) => r.includes("оператор") || r.includes("регистратор"), cls: "rt-blue", icon: <IHeadset size={15} /> },
  { test: (r) => r.includes("дом") || r.includes("ожидани"), cls: "rt-blue", icon: <IBell size={15} /> },
];

export function reasonStyle(reason: string, urgent: boolean): { cls: string; icon: ReactNode } {
  const r = reason.toLowerCase();
  return REASONS.find((x) => x.test(r, urgent)) ?? { cls: "rt-grey", icon: <IQuestion /> };
}

export const STATUS_CLS: Record<HandoffStatus, string> = {
  "новая": "sp-orange", "в работе": "sp-blue", "перезвонили": "sp-green", "закрыта": "sp-grey",
};
