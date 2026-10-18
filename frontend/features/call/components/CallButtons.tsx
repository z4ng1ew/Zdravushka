// Кнопки под микрофоном: «Завершить», «Регистратор», «Заново».

import { HangupIcon, HeadsetIcon, RefreshIcon } from "@/shared/ui/Icons";

export default function CallButtons({ active, aiLeads, sending, onEnd, onRegistrar, onRestart }: {
  active: boolean; aiLeads: boolean; sending: boolean;
  onEnd: () => void; onRegistrar: () => void; onRestart: () => void;
}) {
  return (
    <div className="call-buttons">
      <button className="btn-big btn-red" onClick={onEnd} disabled={!active} data-tip="Положить трубку">
        <HangupIcon /> Завершить
      </button>
      <div className="btn-pair">
        <button className="btn-big btn-green" onClick={onRegistrar} disabled={!aiLeads || sending}
          data-tip="Переключить на живого регистратора — он увидит весь разговор и не будет переспрашивать">
          <HeadsetIcon size={20} /> Регистратор
        </button>
        <button className="btn-big btn-outline" onClick={onRestart} disabled={sending} data-tip="Начать разговор заново">
          <RefreshIcon /> Заново
        </button>
      </div>
    </div>
  );
}
