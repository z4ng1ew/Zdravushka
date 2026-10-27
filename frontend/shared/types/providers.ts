// Источники нейросетей (GET /api/providers) и последний ответ ИИ (поле last_ai в /api/health).
// Только чтение: переключает администратор на VM. Токенов и адресов в ответе нет — так задумано.

export interface AiProvider {
  name: string; // organizers — шлюз организаторов, mac — свой сервер команды
  title: string;
  stt: boolean; // умеет распознавание речи
  llm: boolean; // умеет понимание (LLM)
  stt_model: string;
  llm_model: string;
}

export interface Providers {
  active: { stt: string | null; llm: string | null }; // какой источник выбран
  providers: AiProvider[];
}

export interface AiCall { provider: string; model: string; ms: number }
export interface LastAi { stt: AiCall | null; llm: AiCall | null }
