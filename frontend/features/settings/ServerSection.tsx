"use client";

// «Сервер»: связь с бэкендом, режим МИС, ИИ-сервисы, источники нейросетей и ссылка на журнал ошибок.

import Link from "next/link";
import { useEffect, useState } from "react";
import { readErrors } from "@/shared/api/errorLog";
import { useHealth } from "@/shared/hooks/useHealth";
import ErrorCode from "@/shared/ui/ErrorCode";
import { ISettings } from "@/shared/ui/NavIcons";
import Section from "@/shared/ui/Section";
import HealthRows from "./HealthRows";
import ProvidersRows from "./ProvidersRows";

export default function ServerSection() {
  const { data, error } = useHealth();
  const [errCount, setErrCount] = useState(0);
  useEffect(() => setErrCount(readErrors().length), []);
  return (
    <Section icon={<ISettings size={24} />} title="Сервер">
      <div className="set-row">
        <div><b>Бэкенд</b><small>GET /api/health</small></div>
        {error ? <ErrorCode status={error.status} detail={error.message} />
          : data ? <span className="sp sp-green">на связи</span> : <span className="muted">проверяю…</span>}
      </div>
      {data && !error && <HealthRows h={data} />}
      <ProvidersRows lastAi={data?.last_ai} />
      <div className="set-row">
        <div><b>Журнал ошибок</b><small>все ошибки запросов с выгрузкой в .log</small></div>
        <Link href="/staff/errors/" className="btn">{errCount ? `Открыть (${errCount})` : "Открыть"}</Link>
      </div>
    </Section>
  );
}
