// Контракт кабинета сотрудника: /api/calls, /api/live, /api/handoffs, /api/reminders (app/main.py бэкенда).

export type CallResult = "записан" | "перенесён" | "отменён" | "справка" | "переведён" | "сброшен";

export type Speaker = "patient" | "bot" | "operator"; // пациент, ИИ-ассистент, регистратор

export interface Utterance {
  speaker: Speaker;
  confidence?: number; // уверенность распознавания речи пациента (0–1)
  text: string;
  at: string; // «ЧЧ:ММ:СС»
}

/** Запрос ассистента к стенду «Регистратура» (МИС) */
export interface StandRequest {
  method: "GET" | "POST" | "PATCH";
  path: string;
  status: number; // 0 — нет ответа
  note?: string;
}

export interface Call {
  id: string;
  direction: "входящий" | "исходящий";
  started_at: string; // «ДД.ММ.ГГГГ ЧЧ:ММ»
  duration_sec: number;
  intent: string;
  result: CallResult;
  patient: string | null; // уже замаскировано бэкендом: «Иванов П. С.»
  transcript: Utterance[];
  stand_requests: StandRequest[];
  active?: boolean; // /api/live: звонок идёт прямо сейчас
  flags?: string[]; // отметки бэкенда, например prompt_injection — попытка промпт-инъекции
  timings?: PhraseTiming[]; // скорость ответа по фразам (только телефонные звонки); нет — не показываем
  rule?: string; // правило регламента перевода на регистратора (R-07) — рядом с итогом в журнале
}

/** Время ответа на одну фразу пациента: распознавание и диалог (понимание + МИС), без синтеза голоса */
export interface PhraseTiming {
  stt_ms: number;
  dialog_ms: number;
  stt?: string | null; // кто распознал: organizers — шлюз организаторов, mac — наш сервер
  llm?: string | null; // кто понял фразу; null — LLM не понадобилась (разбор правилами)
}

export type HandoffStatus = "новая" | "в работе" | "перезвонили" | "закрыта";

export interface Handoff {
  id: string;
  call_id: string;
  created_at: string;
  reason: string; // «неотложное состояние», «жалоба», «просьба оператора»…
  urgent: boolean;
  status: HandoffStatus;
  phone: string; // маскированный номер
  summary: string;
  collected: Record<string, string>; // что ассистент успел узнать
  transcript: Utterance[];
}

/** «ожидает», «в очереди», «звоним», «подтвердил», «перенёс», «отменил», «не дозвонились», «без ответа», «ошибка звонка» */
export type ReminderStatus = string;

export interface Reminder {
  visit_id: number;
  patient: string;
  doctor: string;
  specialty: string;
  scheduled_at: string;
  status: ReminderStatus;
  new_time?: string | null;
}
