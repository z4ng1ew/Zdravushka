// Режим МИС из GET /api/health → плашка в шапке. Тексты — здесь, отображение — в shared/ui/MisBadge.

import type { Health } from "../types/chat";

export type MisMode = "stand" | "mock" | "none" | "unknown";

export function misMode(h: Health | null): MisMode {
  const m = (h?.mode ?? "").toLowerCase();
  if (m === "stand") return "stand";
  if (m === "mock" || m === "demo") return "mock";
  if (m === "no-stand" || m === "nostand" || m === "none" || m === "offline") return "none";
  return "unknown";
}

export interface MisView { cls: string; text: string; tip: string }

const VIEW: Record<Exclude<MisMode, "unknown">, MisView> = {
  stand: { cls: "mis-stand", text: "МИС подключена", tip: "Записи, переносы и отмены сразу попадают в МИС «Регистратура»." },
  mock: { cls: "mis-mock", text: "Имитация МИС", tip: "Режим отладки: записи идут в учебную копию расписания, в настоящую МИС не попадают." },
  none: { cls: "mis-none", text: "МИС не подключена", tip: "Нет связи со стендом «Регистратура» — звонки переводятся на регистратора." },
};

export function misView(h: Health): MisView {
  const mode = misMode(h);
  return mode === "unknown" ? { cls: "mis-mock", text: `Режим: ${h.mode ?? "—"}`, tip: "Неизвестный режим сервера." } : VIEW[mode];
}

/** Дополнительные строки подсказки: доверенный контур (152-ФЗ) и работа без нейросети */
export function misExtras(h: Health): string[] {
  return [
    h.pd_trusted_ai_only ? "🔒 Данные в доверенном контуре (152-ФЗ): речь и текст пациентов уходят только в доверенные ИИ-сервисы." : "",
    h.llm === false ? "Упрощённое понимание речи (без нейросети): разбор по ключевым словам." : "",
  ].filter(Boolean);
}
