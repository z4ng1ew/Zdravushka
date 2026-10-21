// Врач из справочника GET /api/doctors (data/schedule.json бэкенда).
// id совпадает с doctor_id в ответах /api/chat (D001 → 1).

export interface Doctor {
  id: number;
  fullName: string;
  specialty: string;
  department?: string;
  patients?: string;
  cabinet: string;
  slotMin?: number; // длительность приёма, мин
  weekly?: Record<string, string>; // «Пн» → «08:00–14:00» или «09:00–13:00, 14:00–18:00»
}
