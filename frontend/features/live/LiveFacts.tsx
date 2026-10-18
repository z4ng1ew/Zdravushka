// «Что уже понял ИИ» — чтобы регистратор не переспрашивал пациента.

import { intentLabel } from "@/shared/domain/intents";
import type { LiveCall } from "@/shared/types/live";
import { CheckCircle } from "@/shared/ui/Icons";

export default function LiveFacts({ call }: { call: LiveCall }) {
  return (
    <div className="card">
      <h2>Что уже понял ИИ</h2>
      <p className="small muted" style={{ marginTop: -8 }}>Не переспрашивайте пациента — данные уже собраны.</p>
      <dl className="kv mt">
        <dt>Намерение</dt><dd>{intentLabel(call.intent)}</dd>
        {Object.entries(call.fields).map(([k, v]) => (
          <div key={k} style={{ display: "contents" }}>
            <dt>{k}</dt>
            <dd><span className="ok-ico" style={{ display: "inline-flex", verticalAlign: "-3px", marginRight: 4 }}><CheckCircle size={15} /></span>{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
