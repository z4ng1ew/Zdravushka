// Правая часть экрана звонка: заголовок, экстренный блок, лента, варианты, быстрые фразы, ввод.

import type { CallState } from "../model/callState";
import { patientSpoke } from "../model/feed";
import AskForm from "./AskForm";
import DialogFeed from "./DialogFeed";
import { DialogTitle, EmergencyBanner, RulesNote } from "./DialogNotes";
import OptionsBar from "./OptionsBar";
import QuickPhrases from "./QuickPhrases";

export interface DialogPanelProps {
  call: CallState;
  canCall: boolean;
  onReplay?: (text: string) => void;
  onChoose: (i: number) => void;
  onSay: (text: string) => void; // быстрая фраза
  onSend: (text: string) => void; // текст из поля ввода
  onMic: () => void;
}

export default function DialogPanel({ call, canCall, onReplay, onChoose, onSay, onSend, onMic }: DialogPanelProps) {
  const showQuick = call.mode === "ai" && !call.sending && !patientSpoke(call.feed);
  return (
    <div className="call-right">
      <DialogTitle />
      <EmergencyBanner escalation={call.escalation} />
      <DialogFeed feed={call.feed} operator={call.operator} typing={call.phase === "active" && call.sending} onReplay={onReplay} />
      <OptionsBar options={call.options} disabled={call.sending} onChoose={onChoose} />
      {showQuick && <QuickPhrases onSay={onSay} />}
      <AskForm toOperator={call.mode !== "ai"} disabled={call.sending} canCall={canCall} onSend={onSend} onMic={onMic} />
      <RulesNote />
    </div>
  );
}
