// Формат «живого» звонка между экраном пациента и кабинетом регистратора (перехват разговора).

import type { ReplyTag } from "../domain/replyTags";
import type { Speaker } from "./staff";

export type CallMode = "ai" | "waiting" | "operator"; // ведёт ИИ / ждёт регистратора / ведёт регистратор
export type CallPhase = "idle" | "active" | "ended";

export interface LiveLine {
  speaker: Speaker;
  text: string;
  at: string;
  confidence?: number; // для реплик пациента: уверенность распознавания
  tags?: ReplyTag[]; // для реплик бота: бейдж статуса и источника ответа
  explain?: string; // для реплик бота: понятное пояснение (explanation) — видят все
  tech?: string; // для реплик бота: кем понята фраза, точность распознавания — только регистратору
}

export interface LiveCall {
  phase: CallPhase;
  mode: CallMode;
  seconds: number;
  intent: string | null;
  fields: Record<string, string>;
  lines: LiveLine[];
  operator: string | null;
}

// Пациентов может быть несколько (несколько вкладок): у каждой свой номер from,
// команды регистратора адресуются одной вкладке полем to.
export type LiveMessage =
  | { type: "state"; call: LiveCall; from: string } // экран пациента → регистратору
  | { type: "hello" } // регистратор открыл вкладку и просит текущее состояние у всех
  | { type: "takeover"; operator: string; to: string } // регистратор перехватил разговор
  | { type: "release"; to: string } // регистратор вернул разговор ИИ
  | { type: "operator_say"; text: string; to: string }; // реплика регистратора
