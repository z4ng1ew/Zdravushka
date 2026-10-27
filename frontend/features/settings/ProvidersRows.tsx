"use client";

// «Настройки» → источники нейросетей (GET /api/providers) и последний ответ ИИ (last_ai из /api/health).
// Только чтение: переключает администратор на VM, кнопок нет. Старый бэкенд без /api/providers — блок не показываем.

import { getProviders } from "@/shared/api/providers";
import { POLL } from "@/shared/config";
import { lastAiText } from "@/shared/domain/speed";
import { usePolling } from "@/shared/hooks/usePolling";
import type { AiProvider, LastAi, Providers } from "@/shared/types/providers";
import ErrorCode from "@/shared/ui/ErrorCode";

const NOTE = "Если выбранный источник не ответил за 4–6 с, ассистент берёт следующий, затем — разбор по правилам. "
  + "Речь пациента обрабатывается только в России (152-ФЗ).";

/** «✓ выбран» — источник выбран для распознавания или LLM; иначе — запасной */
function Role({ p, active }: { p: AiProvider; active: Providers["active"] }) {
  const on = active.stt === p.name || active.llm === p.name;
  return on ? <span className="sp sp-green">✓ выбран</span> : <span className="sp sp-grey">запасной</span>;
}

function ProvidersTable({ data }: { data: Providers }) {
  return (
    <div className="set-providers">
      <table className="t2 t-providers">
        <thead><tr><th>Источник</th><th>Распознавание</th><th>Понимание (LLM)</th></tr></thead>
        <tbody>
          {data.providers.map((p) => (
            <tr key={p.name}>
              <td><b>{p.title}</b> <Role p={p} active={data.active} /></td>
              <td>{p.stt ? p.stt_model || "да" : <span className="muted">—</span>}</td>
              <td>{p.llm ? p.llm_model || "да" : <span className="muted">—</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <small className="muted">{NOTE}</small>
    </div>
  );
}

export default function ProvidersRows({ lastAi }: { lastAi?: LastAi | null }) {
  const { data, error } = usePolling(getProviders, POLL.health);
  const last = lastAiText(lastAi);
  if (error?.status === 404) return null; // бэкенд без источников — не показываем
  return (
    <>
      <div className="set-row set-row-col">
        <div><b>Источники нейросетей</b><small>GET /api/providers · переключает администратор на VM</small></div>
        {error ? <ErrorCode status={error.status} detail={error.message} />
          : data ? <ProvidersTable data={data} /> : <span className="muted">загружаю…</span>}
      </div>
      {last && (
        <div className="set-row">
          <div><b>Последний ответ ИИ</b><small>из /api/health → last_ai</small></div>
          <span className="sp sp-blue">{last}</span>
        </div>
      )}
    </>
  );
}
