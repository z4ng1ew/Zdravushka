// Шапка экранов пациента («Позвонить в регистратуру», «Мои талоны»).

import Link from "next/link";
import type { ReactNode } from "react";
import AppHeader from "./AppHeader";
import { patientMenu, type PatientPage } from "./menus";
import UserChip from "./UserChip";

const ROLE: Record<PatientPage, string> = { call: "Звонок в регистратуру", tickets: "Мои талоны" };

export default function PatientHeader({ page, status }: { page: PatientPage; status?: ReactNode }) {
  const links = page === "call" && (
    <Link href="/tickets/" className="link-staff" data-tip="Куда и когда вы записаны" data-tip-pos="bottom">Мои талоны</Link>
  );
  return (
    <AppHeader
      wide={page === "tickets"}
      status={status}
      links={links}
      chip={<UserChip name="Пациент" role={ROLE[page]} avatar="/img/avatar-patient.png" items={patientMenu(page)} />}
    />
  );
}
