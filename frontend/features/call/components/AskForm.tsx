"use client";

// Поле ввода под лентой: текст Здравушке (или регистратору, если он на линии) и кнопка-микрофон.
// Пока Здравушка отвечает, поле не блокируется — курсор остаётся в поле, можно печатать дальше;
// отправка ждёт ответа (кнопка неактивна, Enter не отправляет).

import { useRef, useState, type FormEvent } from "react";
import { SendIcon } from "@/shared/ui/Icons";

export default function AskForm({ toOperator, disabled, canCall, onSend, onMic }: {
  toOperator: boolean; disabled: boolean; canCall: boolean;
  onSend: (text: string) => void; onMic: () => void;
}) {
  const [text, setText] = useState("");
  const input = useRef<HTMLInputElement>(null);
  function submit(e: FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t || disabled) return;
    setText("");
    onSend(t);
    input.current?.focus(); // на телефоне кнопка «отправить» забирает фокус — возвращаем в поле
  }
  return (
    <form className="ask" onSubmit={submit}>
      <button type="button" className="ask-mic" aria-label="Говорить" onClick={onMic} disabled={!canCall} data-tip="Позвонить голосом">
        <img src="/img/mic-button.png" alt="" />
      </button>
      <input ref={input} value={text} onChange={(e) => setText(e.target.value)} maxLength={500}
        aria-label={toOperator ? "Сообщение регистратору" : "Вопрос Здравушке"} autoComplete="off" enterKeyHint="send"
        placeholder={toOperator ? "Сообщение регистратору…" : "Спросите Здравушку…"} />
      <button type="submit" disabled={!text.trim() || disabled} aria-label="Отправить" data-tip="Отправить"
        onMouseDown={(e) => e.preventDefault()}><SendIcon /></button>
    </form>
  );
}
