"use client";

// «Звонок сейчас»: телефонные звонки с сервера (GET /api/live) и демо-звонок из этого браузера.

import { ErrorInline } from "@/shared/ui/ErrorCode";
import PhoneCallCard from "./PhoneCallCard";
import { useLiveCall } from "./useLiveCall";
import { usePhoneCalls } from "./usePhoneCalls";
import WebCall from "./WebCall";

function NoCall() {
  return (
    <div className="card live-empty">
      <img src="/img/mic-flat.png" width={64} height={64} alt="" />
      <div>
        <b>Сейчас нет активных звонков</b>
        <p className="muted small">Как только пациент позвонит Здравушке, разговор появится здесь.</p>
      </div>
    </div>
  );
}

export default function LiveScreen() {
  const phone = usePhoneCalls();
  const web = useLiveCall();
  const calls = phone.data ?? [];
  const webCall = web.call && web.call.phase !== "idle" ? web.call : null;
  return (
    <>
      <h1 className="page-title">Звонок сейчас</h1>
      <p className="page-sub">
        Разговор ИИ с пациентом в реальном времени: расшифровка и запросы к МИС. Звонок с сайта можно перехватить.
      </p>
      {phone.error && <ErrorInline status={phone.error.status} detail={phone.error.message} />}
      {calls.map((c) => <PhoneCallCard key={c.id} call={c} />)}
      {webCall && <WebCall call={webCall} onSay={web.say} onTakeover={web.takeover} onRelease={web.release} />}
      {!calls.length && !webCall && <NoCall />}
    </>
  );
}
