// Талон пациента — квитанция по настоящей записи в МИС для экрана и печати. Хранится только в браузере.
// Номер талона — номер записи в МИС (booking.visit_id): фронт ничего не придумывает.

export type TicketStatus = "Запланирована" | "Отменена" | "Завершена" | "Неявка";

export interface Ticket {
  number: string; // номер записи в МИС строкой («93») — для поиска и ключей списка
  visitId: number; // номер записи в МИС
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
}
