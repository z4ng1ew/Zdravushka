// Речь: распознавание (/api/asr → Whisper) и озвучка ответа (/api/tts).

import { request } from "./http";

const WHERE = "голос";

export interface AsrResult {
  text: string;
  confidence: number | null; // 0–1, если распознаватель её отдаёт
}

/** Отправить запись на распознавание (502 — распознавание недоступно) */
export async function recognize(audio: Blob): Promise<AsrResult> {
  const form = new FormData();
  const ext = audio.type.includes("ogg") ? "ogg" : audio.type.includes("mp4") ? "m4a" : "webm";
  form.append("file", audio, `speech.${ext}`);
  const r = await request<Partial<AsrResult>>("POST", "/api/asr", WHERE, form);
  return { text: (r.text ?? "").trim(), confidence: typeof r.confidence === "number" ? r.confidence : null };
}

/** Озвучить текст (502 — синтез недоступен) */
export const synthesize = (text: string) => request<Blob>("POST", "/api/tts", WHERE, { text }, "blob");
