// Шапка всех экранов: слева логотип и «Аа» (крупный шрифт); справа — плашка режима МИС, ссылки и профиль.

import type { ReactNode } from "react";
import Brand from "./Brand";
import FontToggle from "./FontToggle";

export default function AppHeader({ status, links, chip, wide }: {
  status?: ReactNode; // плашка режима МИС
  links?: ReactNode; // например, «Мои талоны»
  chip: ReactNode; // плашка пользователя
  wide?: boolean; // шапка кабинетов (сетка с меню слева)
}) {
  return (
    <header className={wide ? "topbar topbar2" : "topbar"}>
      <div className="topbar-left">
        <Brand />
        <FontToggle />
      </div>
      <div className="topbar-right">
        {status}
        {links}
        {chip}
      </div>
    </header>
  );
}
