"use client";

// Плашка пользователя в шапке и выпадающее меню переходов (пациент / регистратор).
// Все пункты меню одного размера на любом экране (CSS .chip-menu).

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { IChevron } from "./NavIcons";

export interface ChipMenuItem {
  href?: string;
  label: string;
  hint?: string;
  onClick?: () => void;
  active?: boolean;
}

export default function UserChip({ name, role, avatar, initials, items }: {
  name: string; role: string; avatar?: string; initials?: string; items: ChipMenuItem[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, []);
  return (
    <div className={`chip-user ${open ? "open" : ""}`} ref={ref}>
      <button type="button" className="chip-user-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu">
        <span className="chip-ava">
          {avatar
            ? <img src={avatar} alt="" />
            : <b>{initials}</b>}
        </span>
        <span className="chip-text"><b>{name}</b><small>{role}</small></span>
        <IChevron />
      </button>
      {open && (
        <div className="chip-menu">
          {items.map((it, i) => it.href ? (
            <Link key={i} href={it.href} className={it.active ? "on" : ""} onClick={() => setOpen(false)}>
              {it.label}{it.hint && <small>{it.hint}</small>}
            </Link>
          ) : (
            <button key={i} className={it.active ? "on" : ""} onClick={() => { it.onClick?.(); setOpen(false); }}>
              {it.label}{it.hint && <small>{it.hint}</small>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
