import type { ReactNode } from "react";

/** Блок с синей «шапкой»-полосой, как «Очередь переводов» / «Исходящий обзвон» в макете. */
export default function Section({ icon, title, badge, right, tone = "blue", children }: {
  icon?: ReactNode; title: string; badge?: ReactNode; right?: ReactNode; tone?: "blue" | "teal"; children: ReactNode;
}) {
  return (
    <section className={`sec sec-${tone}`}>
      <div className="sec-head">
        {icon && <span className="sec-ico">{icon}</span>}
        <h2>{title}</h2>
        {badge}
        <div className="sec-right">{right}</div>
      </div>
      <div className="sec-body">{children}</div>
    </section>
  );
}
