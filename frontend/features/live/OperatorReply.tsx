"use client";

// Ответ регистратора пациенту: готовые фразы и поле ввода.

import { useState, type FormEvent } from "react";
import { HeadsetIcon, SendIcon } from "@/shared/ui/Icons";

const QUICK = ["Уточните, пожалуйста, вашу дату рождения.", "Минуту, проверяю расписание.", "Записали вас. Хорошего дня!"];

export default function OperatorReply({ onSay }: { onSay: (text: string) => void }) {
  const [text, setText] = useState("");
  function submit(e: FormEvent) { e.preventDefault(); onSay(text); setText(""); }
  return (
    <>
      <div className="quick">
        {QUICK.map((q) => <button key={q} className="chip" onClick={() => onSay(q)}>{q}</button>)}
      </div>
      <form className="ask ask-op" onSubmit={submit}>
        <HeadsetIcon size={18} />
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={500} placeholder="Ответ пациенту…" />
        <button type="submit" disabled={!text.trim()} aria-label="Отправить"><SendIcon /></button>
      </form>
    </>
  );
}
