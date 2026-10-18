// Лента разговора: реплики, талоны, подсказки и ошибки — и выборки по ней.

import type { LiveLine } from "@/shared/types/live";
import type { Ticket } from "@/shared/types/ticket";

export type FeedItem =
  | { type: "line"; line: LiveLine }
  | { type: "error"; status: number | null; detail: string; at: string }
  | { type: "ticket"; ticket: Ticket; at: string }
  | { type: "notice"; text: string; at: string }; // подсказка пациенту: что делать, если голос не сработал

export const feedLines = (feed: FeedItem[]): LiveLine[] =>
  feed.flatMap((f) => (f.type === "line" ? [f.line] : []));

/** Индекс последней реплики бота — у неё кнопка «Повторить» */
export const lastBotIndex = (feed: FeedItem[]): number =>
  feed.reduce((acc, f, i) => (f.type === "line" && f.line.speaker === "bot" ? i : acc), -1);

export const patientSpoke = (feed: FeedItem[]): boolean =>
  feed.some((f) => f.type === "line" && f.line.speaker === "patient");
