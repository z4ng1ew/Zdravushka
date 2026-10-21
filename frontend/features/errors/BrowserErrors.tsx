"use client";

// «Ошибки запросов этого браузера» — журнал с выгрузкой в .log для бэкенда.

import { describe, toLogText } from "@/shared/api/errorLog";
import { downloadText } from "@/shared/browser/download";
import ErrorCode from "@/shared/ui/ErrorCode";
import { useErrorLog } from "./useErrorLog";

const logName = () => `clinicai-errors-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.log`;

export default function BrowserErrors() {
  const { list, clear } = useErrorLog();
  return (
    <>
      <div className="btn-row" style={{ marginBottom: 14 }}>
        <button className="btn btn-primary" onClick={() => downloadText(toLogText(list), logName())} disabled={!list.length}
          data-tip="Файл .log: одна строка — одна ошибка">Скачать .log</button>
        <button className="btn" onClick={clear} disabled={!list.length}>Очистить</button>
      </div>
      {!list.length ? <div className="card live-empty"><b>Пусто</b></div> : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table>
            <thead><tr><th>Код</th><th>Время</th><th>Запрос</th><th>Где</th><th>Описание</th></tr></thead>
            <tbody>
              {list.map((e, i) => (
                <tr key={i}>
                  <td><ErrorCode status={e.status} detail={e.message} /></td>
                  <td className="small">{new Date(e.at).toLocaleString("ru-RU")}</td>
                  <td className="small mono">{e.method} {e.path}</td>
                  <td className="small">{e.where}</td>
                  <td className="small"><b>{describe(e.status)}</b><div className="muted">{e.message}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
