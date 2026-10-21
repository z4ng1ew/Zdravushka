// Все страницы /staff/… — внутри каркаса кабинета регистратора.

import StaffShell from "@/features/registrar/StaffShell";

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  return <StaffShell>{children}</StaffShell>;
}
