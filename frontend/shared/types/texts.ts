// Тексты интерфейса с сервера (GET /api/texts): приветствие, подсказки, фразы маскота.
// Один источник текстов — бэкенд (app/dialog/common.py); во фронте текстов для пациента нет.
// Поля меняем только вместе с Мовсаром.

export type HintKey = "say_again" | "give_up" | "not_heard" | "error";
export type MascotKey = "idle" | "thinking" | "error" | "done" | "escalated";

export interface UiTexts {
  assistant_name: string;
  greeting: string; // приветствие в ленте до начала звонка
  goodbye: string;
  operator_greeting: string; // первая фраза регистратора после перехвата
  hints: Record<HintKey, string>; // подсказки пациенту, когда голос не распознан
  mascot: Record<MascotKey, string>; // фраза маскота над микрофоном
}
