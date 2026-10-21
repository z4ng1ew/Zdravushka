"use client";

// Каркас кабинета: шапка + узкое меню из иконок слева (раскрывается при наведении) + содержимое.
// Содержимое рисуем только в браузере: оно зависит от текущей даты и данных сервера,
// иначе статическая сборка (дата сборки) не совпадёт с клиентом.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import AppHeader from "./AppHeader";
import ErrorBoundary from "./ErrorBoundary";
import { MisBadgeAuto } from "./MisBadge";

export interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
}

const same = (a: string, b: string) => a.replace(/\/$/, "") === b.replace(/\/$/, "");

function Rail({ nav }: { nav: NavItem[] }) {
  const path = usePathname() ?? "";
  return (
    <nav className="rail" aria-label="Меню" style={{ "--n": nav.length } as React.CSSProperties}>
      <div className="rail-inner">
        {nav.map((n) => (
          <Link key={n.href} href={n.href} className={`rail-item ${same(path, n.href) ? "on" : ""}`}>
            <span className="rail-ico">{n.icon}</span>
            <span className="rail-label">{n.label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}

export default function Shell({ nav, chip, children }: { nav: NavItem[]; chip: ReactNode; children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const path = usePathname() ?? "";
  useEffect(() => setMounted(true), []);
  return (
    <div className="page">
      <AppHeader wide status={mounted && <MisBadgeAuto />} chip={chip} />
      <div className="app2">
        <Rail nav={nav} />
        <main className="main2">
          {mounted ? <ErrorBoundary inline resetKey={path}>{children}</ErrorBoundary> : <div className="empty-row">Загрузка…</div>}
        </main>
      </div>
    </div>
  );
}
