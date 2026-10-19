"use client";

// Лента разговора: реплики (цвет по говорящему), талоны, подсказки и ошибки одной цифрой.

import { useEffect, useRef } from "react";
import Bubble from "@/shared/ui/Bubble";
import { describe } from "@/shared/api/errorLog";
import ErrorCode from "@/shared/ui/ErrorCode";
import TicketCard from "@/shared/ui/TicketCard";
import { lastBotIndex, type FeedItem } from "../model/feed";
import { GREETING } from "../model/greeting";

interface RowProps { item: FeedItem; operator: string | null; onReplay?: () => void; onRetry?: () => void }

function FeedRow({ item, operator, onReplay, onRetry }: RowProps) {
  switch (item.type) {
    case "line": return <Bubble {...item.line} operator={operator} onReplay={onReplay} />;
    case "ticket": return <div className="row ticket-row"><TicketCard ticket={item.ticket} compact /></div>;
    case "notice": return <div className="row notice-row" role="status"><span>ℹ {item.text}</span><span className="err-time">{item.at}</span></div>;
    case "error": return (
      <div className="row err-row">
        <ErrorCode status={item.status} detail={item.detail} />
        <span className="err-note">{describe(item.status)}</span>
        {onRetry && <button type="button" className="btn-mini" onClick={onRetry}>↻ Отправить ещё раз</button>}
        <span className="err-time">{item.at}</span>
      </div>
    );
  }
}

/** До звонка: приветствие Здравушки и подсказка, что можно сделать */
function Welcome() {
  return (
    <>
      <Bubble speaker="bot" text={GREETING} at="" />
      <div className="dialog-empty">
        Нажмите на микрофон или напишите вопрос ниже
        <small>Здравушка записывает к врачу, переносит и отменяет приём, подсказывает статус записи,
          расписание и кабинет врача, принимает заявку на вызов врача на дом и отвечает по правилам поликлиники.</small>
      </div>
    </>
  );
}

export default function DialogFeed({ feed, operator, typing, onReplay, onRetry }: {
  feed: FeedItem[]; operator: string | null; typing: boolean;
  onReplay?: (text: string) => void; // «Повторить» у последнего ответа; undefined — озвучки нет
  onRetry?: (text: string) => void; // отправить ещё раз фразу, на которую сервер ответил ошибкой
}) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { box.current?.scrollTo({ top: box.current.scrollHeight, behavior: "smooth" }); }, [feed]);
  const lastBot = lastBotIndex(feed);
  return (
    <div className="dialog" ref={box}>
      {feed.length === 0 && <Welcome />}
      {feed.map((f, i) => (
        <FeedRow key={i} item={f} operator={operator}
          onReplay={i === lastBot && f.type === "line" && onReplay ? () => onReplay(f.line.text) : undefined}
          onRetry={i === feed.length - 1 && f.type === "error" && f.retry && onRetry && !typing ? () => onRetry(f.retry!) : undefined} />
      ))}
      {typing && <div className="typing-dots"><i /><i /><i /></div>}
    </div>
  );
}
