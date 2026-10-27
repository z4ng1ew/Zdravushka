// Источники нейросетей: GET /api/providers. Разбор мягкий: негодный источник пропускаем.

import type { AiCall, AiProvider, LastAi, Providers } from "../types/providers";
import { request } from "./http";
import { isObj, obj, softList, str, strOrNull } from "./parse";

function parseProvider(v: unknown): AiProvider | null {
  if (!isObj(v) || !str(v.name)) return null;
  return {
    name: str(v.name), title: str(v.title) || str(v.name), stt: v.stt === true, llm: v.llm === true,
    stt_model: str(v.stt_model), llm_model: str(v.llm_model),
  };
}

export function parseProviders(raw: unknown): Providers {
  const d = obj(raw, "ответ /api/providers");
  const a = isObj(d.active) ? d.active : {};
  return { active: { stt: strOrNull(a.stt), llm: strOrNull(a.llm) }, providers: softList(d.providers, parseProvider) };
}

function parseAiCall(v: unknown): AiCall | null {
  if (!isObj(v) || !str(v.provider) || typeof v.ms !== "number" || !Number.isFinite(v.ms) || v.ms < 0) return null;
  return { provider: str(v.provider), model: str(v.model), ms: v.ms };
}

/** last_ai из /api/health: нет поля или мусор — null (строку не показываем) */
export function parseLastAi(v: unknown): LastAi | null {
  if (!isObj(v)) return null;
  const r = { stt: parseAiCall(v.stt), llm: parseAiCall(v.llm) };
  return r.stt || r.llm ? r : null;
}

export const getProviders = (): Promise<Providers> =>
  request("GET", "/api/providers", "источники нейросетей", { parse: parseProviders });
