// Талон пациента — копия записи из МИС для экрана и печати. Хранится только в браузере.

export type TicketStatus = "Запланирована" | "Отменена" | "Завершена" | "Неявка";

export interface Ticket {
  number: string; // номер талона, например «Т-012»
  visitId: number | null; // номер записи в МИС
  patient: string; // замаскировано: «Иванов И. И.» (152-ФЗ)
  doctor: string; // ФИО врача полностью
  specialty: string;
  cabinet: string;
  scheduledAt: string; // «ДД.ММ.ГГГГ ЧЧ:ММ»
  status: TicketStatus;
  createdAt: string;
  updatedAt: string;
  history: { at: string; text: string }[];
}

export interface TicketsData {
  v: 1;
  tickets: Ticket[];
  seq: Record<string, number>; // счётчики номеров талонов по букве специальности
}
