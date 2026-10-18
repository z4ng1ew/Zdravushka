// Строки состояния сервера из GET /api/health: МИС, речь и ИИ, персональные данные.

import { misMode, misView } from "@/shared/domain/misMode";
import type { Health } from "@/shared/types/chat";

const MIS_CLS = { stand: "sp-green", mock: "sp-orange", none: "sp-red", unknown: "sp-grey" } as const;

function Flag({ on, label, value }: { on: boolean; label: string; value: string }) {
  return <span className={`sp ${on ? "sp-green" : "sp-grey"}`}>{label} {value}</span>;
}

export default function HealthRows({ h }: { h: Health }) {
  return (
    <>
      <div className="set-row">
        <div><b>МИС «Регистратура»</b><small>режим: {h.mode ?? "—"}</small></div>
        <span className={`sp ${MIS_CLS[misMode(h)]}`}>{misView(h).text}</span>
      </div>
      <div className="set-row">
        <div><b>Речь и ИИ</b><small>распознавание · синтез · языковая модель · телефония</small></div>
        <span className="set-flags">
          <Flag on={!!h.stt} label="STT" value={h.stt ? "вкл" : "нет"} />
          <Flag on={!!h.tts} label="TTS" value={h.tts ? String(h.tts) : "нет"} />
          <Flag on={!!h.llm} label="LLM" value={h.llm ? "вкл" : "правила"} />
          <Flag on={!!h.telephony} label="АТС" value={h.telephony ?? "нет"} />
        </span>
      </div>
      {h.pd_trusted_ai_only !== undefined && (
        <div className="set-row">
          <div><b>Персональные данные</b><small>речь и текст пациентов уходят только в доверенный контур (152-ФЗ)</small></div>
          <span className={`sp ${h.pd_trusted_ai_only ? "sp-green" : "sp-red"}`}>
            {h.pd_trusted_ai_only ? "только доверенные ИИ" : "есть недоверенный адрес ИИ"}
          </span>
        </div>
      )}
    </>
  );
}
