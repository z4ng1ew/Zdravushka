// Простые карточки нижней панели: на линии регистратор / пусто.

import { HeadsetIcon } from "@/shared/ui/Icons";

export function OperatorCard({ onLine }: { onLine: boolean }) {
  return (
    <div className="record">
      <div className={`result ${onLine ? "result-op" : "result-warn"}`}>
        <span className="ok-ico"><HeadsetIcon size={22} /></span>
        <div>
          <b>{onLine ? "Разговор ведёт регистратор" : "Передано регистратору"}</b>
          <div>Регистратор видит весь разговор и то, что понял ИИ.</div>
        </div>
      </div>
    </div>
  );
}

export function EmptyCard() {
  return (
    <div className="record record-empty">
      <img src="/img/mascot-ticket.png" width={88} height={88} alt="Здравушка" />
      <p>Пусто — запись появится здесь, как только помощник оформит её.</p>
    </div>
  );
}
