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

export type LiveMessage =
  | { type: "state"; call: LiveCall } // экран пациента → регистратору
  | { type: "hello" } // регистратор открыл вкладку и просит текущее состояние
  | { type: "takeover"; operator: string } // регистратор перехватил разговор
  | { type: "release" } // регистратор вернул разговор ИИ
  | { type: "operator_say"; text: string }; // реплика регистратора
