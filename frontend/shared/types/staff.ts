// Контракт кабинета сотрудника: /api/calls, /api/handoffs, /api/reminders (app/main.py бэкенда).

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
