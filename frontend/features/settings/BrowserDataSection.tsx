"use client";

// «Данные этого браузера»: в браузере только талоны пациента — их можно удалить.

import { clearTickets, useTickets } from "@/shared/store/ticketStorage";
import { ISettings } from "@/shared/ui/NavIcons";
import Section from "@/shared/ui/Section";

export default function BrowserDataSection() {
  const { tickets } = useTickets();
  const clear = () => { if (confirm("Удалить талоны в этом браузере?")) clearTickets(); };
  return (
    <Section icon={<ISettings size={24} />} title="Данные этого браузера">
      <p className="muted small" style={{ margin: "0 0 12px" }}>
        Звонки, переводы и обзвон берутся с сервера. В браузере хранятся только талоны пациента
        (их печатают и показывают в регистратуре): сейчас {tickets.length}.
      </p>
      <div className="set-row">
        <div><b>Очистить талоны</b><small>удалить талоны, сохранённые в этом браузере</small></div>
        <button className="btn btn-danger-o" onClick={clear}>Очистить</button>
      </div>
    </Section>
  );
}
