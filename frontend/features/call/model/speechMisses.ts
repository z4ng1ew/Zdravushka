// Что делать, если речь пациента не распознана, пациент молчит или микрофон недоступен.
// Промах: первый — молча слушаем дальше (часто это шум комнаты), второй — «не расслышал»,
// три подряд — перестаём слушать по кругу и предлагаем текст или регистратора. Тишина: 15 с — слушаем дальше, 30 с — выключаем микрофон.

import type { MicProblem } from "@/shared/browser/recorder";
import type { HintKey } from "@/shared/types/texts";

export const MAX_SPEECH_MISSES = 3; // микрофон выключаем только после 3 промахов подряд
export const MAX_SILENT_TURNS = 2; // по 15 с записи
/** Шум комнаты (вентилятор, улица) в паузах — не тишина и не промах: слушаем дальше молча.
 *  Выключаем микрофон, только если одним шумом прошло столько записей подряд — пациент, видимо, отошёл. */
export const MAX_NOISE_TURNS = 8;

/** Счётчики подряд: промахи распознавания, тихие записи, записи с одним шумом */
export interface MissCounts { misses: number; silent: number; noise: number }
export const freshCounts = (): MissCounts => ({ misses: 0, silent: 0, noise: 0 });

/** Тексты подсказок — с сервера (GET /api/texts → hints); здесь только какую показать */
export const SAY_AGAIN: HintKey = "say_again";
export const GIVE_UP: HintKey = "give_up";
export const NOT_HEARD: HintKey = "not_heard";

/** Микрофон недоступен — это про браузер пациента, не про разговор: тексты здесь */
export const MIC_TEXT: Record<MicProblem, string> = {
  insecure: "Голос работает только на защищённом адресе (https) или на этом компьютере (localhost). Пишите текстом в поле ниже.",
  unsupported: "Этот браузер не умеет записывать голос. Пишите текстом в поле ниже или откройте сайт в Chrome, Edge, Firefox или Safari.",
  denied: "Нет доступа к микрофону. Разрешите микрофон в браузере или пишите текстом в поле ниже.",
};

export type MissReaction = { listen: boolean; notice: HintKey | null }; // notice — какую подсказку показать

/** «Не расслышал» — только если пациент правда говорил (не меньше этого), а распознать не вышло.
 *  Короче — это щелчок, эхо или вздох: молча слушаем дальше, как при тишине. */
export const SAID_SOMETHING_MS = 1200; // шум комнаты короче 1,2 с — не речь
export const saidSomething = (speechMs: number) => speechMs >= SAID_SOMETHING_MS;

/** Пауза после озвучки перед включением микрофона: хвост звука и эхо комнаты затихают */
export const ECHO_TAIL_MS = 700; // дольше ждём, пока затихнет эхо озвучки

/** misses — сколько промахов подряд, включая этот.
 *  Первый — молча слушаем дальше (часто это шум), второй — «не расслышал», третий — выключаем */
export function missReaction(misses: number): MissReaction {
  if (misses >= MAX_SPEECH_MISSES) return { listen: false, notice: GIVE_UP };
  return { listen: true, notice: misses === 1 ? null : SAY_AGAIN };
}

/** Распознавание вернуло пусто. Пациент правда говорил — промах (missReaction); звук короче — шум: молча слушаем.
 *  Шум не копится в «тишину»: иначе пара шумных пауз выключала бы микрофон у пациента, который просто думает.
 *  count — счётчики подряд (меняются на месте) */
export function emptyReaction(speechMs: number, count: MissCounts): MissReaction {
  if (saidSomething(speechMs)) { count.noise = 0; return missReaction(++count.misses); }
  return ++count.noise >= MAX_NOISE_TURNS ? { listen: false, notice: NOT_HEARD } : { listen: true, notice: null };
}

/** silent — сколько записей подряд прошли в тишине, включая эту */
export function silenceReaction(silent: number): MissReaction {
  return silent >= MAX_SILENT_TURNS ? { listen: false, notice: NOT_HEARD } : { listen: true, notice: null };
}
