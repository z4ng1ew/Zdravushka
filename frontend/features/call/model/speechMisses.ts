// Что делать, если речь пациента не распознана, пациент молчит или микрофон недоступен.
// Промах: первый — просим повторить и слушаем дальше; два подряд — перестаём слушать по кругу
// и предлагаем текст или регистратора. Тишина: 15 с — слушаем дальше, 30 с — выключаем микрофон.

import type { MicProblem } from "@/shared/browser/recorder";

export const MAX_SPEECH_MISSES = 2;
export const MAX_SILENT_TURNS = 2; // по 15 с записи

export const SAY_AGAIN = "Не расслышал. Повторите, пожалуйста, чуть громче и ближе к микрофону.";
export const GIVE_UP = "Не получается разобрать речь. Напишите вопрос в поле ниже "
  + "или нажмите «Регистратор» — соединю с человеком.";
export const NOT_HEARD = "Не слышу вас. Нажмите на микрофон, когда будете готовы, или напишите вопрос ниже.";

export const MIC_TEXT: Record<MicProblem, string> = {
  insecure: "Голос работает только на защищённом адресе (https) или на этом компьютере (localhost). Пишите текстом в поле ниже.",
  unsupported: "Этот браузер не умеет записывать голос. Пишите текстом в поле ниже или откройте сайт в Chrome, Edge, Firefox или Safari.",
  denied: "Нет доступа к микрофону. Разрешите микрофон в браузере или пишите текстом в поле ниже.",
};

export type MissReaction = { listen: boolean; notice: string | null };

/** «Не расслышал» — только если пациент правда говорил (не меньше этого), а распознать не вышло.
 *  Короче — это щелчок, эхо или вздох: молча слушаем дальше, как при тишине. */
export const SAID_SOMETHING_MS = 700;
export const saidSomething = (speechMs: number) => speechMs >= SAID_SOMETHING_MS;

/** Пауза после озвучки перед включением микрофона: хвост звука и эхо комнаты затихают */
export const ECHO_TAIL_MS = 400;

/** misses — сколько промахов подряд, включая этот */
export function missReaction(misses: number): MissReaction {
  return misses >= MAX_SPEECH_MISSES ? { listen: false, notice: GIVE_UP } : { listen: true, notice: SAY_AGAIN };
}

/** Распознавание вернуло пусто. Пациент правда говорил — «не расслышал»; короткий звук (щелчок, эхо) — как тишина.
 *  count — счётчики подряд (меняются на месте) */
export function emptyReaction(speechMs: number, count: { misses: number; silent: number }): MissReaction {
  return saidSomething(speechMs) ? missReaction(++count.misses) : silenceReaction(++count.silent);
}

/** silent — сколько записей подряд прошли в тишине, включая эту */
export function silenceReaction(silent: number): MissReaction {
  return silent >= MAX_SILENT_TURNS ? { listen: false, notice: NOT_HEARD } : { listen: true, notice: null };
}
