// Контракт разговора: POST /api/chat и GET /api/health (app/models.py бэкенда).
// Поля меняем только вместе с Мовсаром.

export interface ChatBooking {
  visit_id: number | null;
  doctor_id: number | null;
  doctor_name: string | null;
  specialty: string | null;
  scheduled_at: string | null; // «ДД.ММ.ГГГГ ЧЧ:ММ»
  spoken: string | null;
  status: string | null; // null — ещё не подтверждена; «Запланирована» / «Отменена» — из МИС
}

export interface ChatEscalation {
  rule: string; // правило регламента, например R-01
  reason: string;
  priority: string;
  emergency: boolean;
  summary: string;
}

export interface ChatResponse {
  session_id: string;
  reply: string;
  intent: string | null;
  collected: Record<string, string>;
  options: ChatBooking[];
  booking: ChatBooking | null;
  escalation: ChatEscalation | null;
  done: boolean;
  status?: string | null; // in_progress | completed | handoff | error
  source?: string | null; // «МИС» | «регламент РГ-ТЕЛ-01» | null
  explanation?: string | null; // почему ответ такой — мелким текстом под бейджем
  understood_by?: string | null; // кто понял фразу: нейросеть (llm) или правила (rules)
  asr_confidence?: number | null; // 0…1 — с какой точностью распознана фраза пациента
  listen_ms?: number; // сколько тишины ждать до конца фразы пациента (мс) — для следующей записи
  label?: string | null; // подпись под ответом от сервера: «✓ Записано в МИС · № записи 837», «👤 Передано регистратору · R-07»…
}

export interface Health {
  status: string;
  assistant?: string;
  mode?: string; // stand | mock | no-stand
  llm?: boolean;
  stt?: boolean;
  tts?: string | boolean | null;
  telephony?: string | null;
  pd_trusted_ai_only?: boolean; // ИИ-сервисы только из доверенного контура (152-ФЗ)
}

/** Карточка записи внизу экрана пациента */
export interface UiBooking {
  kind: "booked" | "pending" | "cancelled";
  doctor: string;
  specialty: string;
  date?: string;
  time?: string;
  spoken?: string; // «завтра, в понедельник, девятнадцатого октября, в восемь ноль-ноль»
  statusText: string; // статус записи в МИС
  visitId: number | null; // номер записи в МИС
  title: string;
  note: string;
}
