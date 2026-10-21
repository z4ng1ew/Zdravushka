// Речь: распознавание (/api/asr → Whisper) и озвучка ответа (/api/tts).

import { request } from "./http";
import { parseAsr, type AsrResult } from "./parseChat";

export type { AsrResult };

const WHERE = "голос";

/** Отправить запись на распознавание (502 — распознавание недоступно) */
export async function recognize(audio: Blob): Promise<AsrResult> {
  const form = new FormData();
  const ext = audio.type.includes("ogg") ? "ogg" : audio.type.includes("mp4") ? "m4a" : "webm";
  form.append("file", audio, `speech.${ext}`);
  return request("POST", "/api/asr", WHERE, { body: form, parse: parseAsr });
}

/** Озвучить текст (502 — синтез недоступен) */
export const synthesize = (text: string) => request<Blob>("POST", "/api/tts", WHERE, { body: { text }, as: "blob" });
