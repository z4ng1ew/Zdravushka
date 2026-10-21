// Запросы ассистента к МИС: успехом считаем только 200 и 201.

import type { Call, StandRequest } from "../types/staff";

const OK_CODES = new Set([200, 201]);

export const isOkRequest = (r: StandRequest) => OK_CODES.has(r.status);

export const failedRequests = (list: StandRequest[]) => list.filter((r) => !isOkRequest(r));

const MIS_FAILURE_TEXT = /сбой|не отвечает|недоступ/i;

/** Звонок со сбоем МИС: запрос вернул не 200/201 или бот перевёл звонок из-за сбоя */
export const isMisFailure = (c: Call) => failedRequests(c.stand_requests).length > 0
  || (c.result === "переведён" && c.transcript.some((u) => u.speaker === "bot" && MIS_FAILURE_TEXT.test(u.text)));
