"use client";

// «Звонок сейчас»: телефонные звонки с сервера (GET /api/live) и звонки с сайта из вкладок этого браузера —
// каждый своей карточкой (несколько пациентов не перебивают друг друга).

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
  const many = web.calls.length > 1;
  return (
    <>
      <h1 className="page-title">Звонок сейчас</h1>
      <p className="page-sub">
        Разговор ИИ с пациентом в реальном времени: расшифровка и запросы к МИС. Звонок с сайта можно перехватить.
      </p>
      {phone.error && <ErrorInline status={phone.error.status} detail={phone.error.message} />}
      {calls.map((c) => <PhoneCallCard key={c.id} call={c} />)}
      {web.calls.map((w, i) => (
        <WebCall key={w.id} call={w.call} title={many ? `Звонок с сайта № ${i + 1}` : undefined}
          onSay={(text) => web.say(w.id, text)} onTakeover={() => web.takeover(w.id)} onRelease={() => web.release(w.id)} />
      ))}
      {!calls.length && !web.calls.length && <NoCall />}
    </>
  );
}
