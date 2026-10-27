import { describe, expect, it } from "vitest";
import { parseHealth } from "@/shared/api/parseChat";
import { FormatError } from "@/shared/api/parse";
import { parseLastAi, parseProviders } from "@/shared/api/providers";
import { lastAiText } from "@/shared/domain/speed";

describe("источники нейросетей — GET /api/providers", () => {
  it("разбор: выбранный источник и список; негодный источник пропускаем", () => {
    const p = parseProviders({
      active: { stt: "mac", llm: "mac" },
      providers: [
        { name: "organizers", title: "Шлюз организаторов", stt: true, llm: true, stt_model: "openai/whisper-large-v3", llm_model: "ai-sage/GigaChat3-10B-A1.8B" },
        { name: "mac", title: "Свой сервер команды (Mac, Россия)", stt: true, llm: true, stt_model: "openai/whisper-1", llm_model: "gemma4" },
        { title: "без имени" }, "мусор",
      ],
    });
    expect(p.active).toEqual({ stt: "mac", llm: "mac" });
    expect(p.providers.map((x) => x.name)).toEqual(["organizers", "mac"]);
    expect(p.providers[1]).toMatchObject({ stt_model: "openai/whisper-1", llm_model: "gemma4", stt: true });
  });
  it("нет active или список не список — пусто, а не падение; не объект — ошибка формата", () => {
    expect(parseProviders({ providers: "нет" })).toEqual({ active: { stt: null, llm: null }, providers: [] });
    expect(() => parseProviders([])).toThrow(FormatError);
  });
});

describe("последний ответ ИИ — last_ai в /api/health", () => {
  it("мягкий разбор: нет поля или мусор — null; часть есть — показываем часть", () => {
    expect(parseHealth({ status: "ok" }).last_ai).toBeNull();
    expect(parseLastAi({ stt: { provider: "mac", ms: -5 } })).toBeNull();
    expect(parseLastAi({ stt: { provider: "mac", model: "whisper-1", ms: 640 } })).toEqual({ stt: { provider: "mac", model: "whisper-1", ms: 640 }, llm: null });
  });
  it("подпись: «распознавание 0,6 с (наш сервер) · LLM 1,1 с (шлюз организаторов)»", () => {
    const a = parseLastAi({ stt: { provider: "mac", model: "", ms: 640 }, llm: { provider: "organizers", model: "", ms: 1120 } });
    expect(lastAiText(a)).toBe("распознавание 0,6 с (наш сервер) · LLM 1,1 с (шлюз организаторов)");
    expect(lastAiText(null)).toBe("");
  });
});
