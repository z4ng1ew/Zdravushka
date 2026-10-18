// Журнал ошибок запросов: хранится в браузере (localStorage), общий для всех экранов,
// показывается на странице «Ошибки» и скачивается файлом .log.

import { ERROR_LOG, STORAGE } from "../config";
import type { ApiError } from "./ApiError";

export interface ErrorEntry {
  at: string; // ISO-время
  status: number | null;
  method: string;
  path: string;
  message: string;
  where: string; // «экран пациента», «очередь оператора» и т. п.
}

const KEY = STORAGE.errors;

const STATUS_TEXT: Record<number, string> = {
  400: "Неверный запрос",
  401: "Нет доступа: токен не принят",
  403: "Доступ запрещён",
  404: "Не найдено (на сервере нет такого адреса)",
  405: "Сервер пока не поддерживает это действие",
  408: "Сервер не ответил вовремя",
  409: "Конфликт: запись уже изменена",
  422: "Неверные данные в запросе",
  429: "Слишком много запросов",
  500: "Ошибка сервера",
  502: "Ошибка шлюза",
  503: "Сервис недоступен",
  504: "Сервер не ответил вовремя",
};

/** Короткое описание кода ответа */
export function describe(status: number | null): string {
  if (status === null) return "Нет связи с сервером";
  return STATUS_TEXT[status] ?? (status >= 500 ? "Ошибка сервера" : "Ошибка запроса");
}

export function readErrors(): ErrorEntry[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function clearErrors(): void {
  try { localStorage.removeItem(KEY); } catch { /* хранилище недоступно */ }
}

const isRepeat = (a: ErrorEntry | undefined, b: ErrorEntry) => !!a
  && a.status === b.status && a.method === b.method && a.path === b.path && a.where === b.where
  && Date.now() - new Date(a.at).getTime() < ERROR_LOG.repeatMs;

export function logError(e: ApiError, where: string): void {
  const entry: ErrorEntry = {
    at: new Date().toISOString(), status: e.status, method: e.method, path: e.path, message: e.message, where,
  };
  console.error(`[${where}] ${e.status ?? "нет связи"} ${e.method} ${e.path}: ${e.message}`);
  try {
    const old = readErrors();
    if (isRepeat(old[0], entry)) return;
    localStorage.setItem(KEY, JSON.stringify([entry, ...old].slice(0, ERROR_LOG.max)));
  } catch { /* хранилище недоступно — остаётся консоль */ }
}

/** Текст лога для скачивания: одна строка — одна ошибка */
export function toLogText(list: ErrorEntry[]): string {
  const head = "# ClinicAI — журнал ошибок\n# время | код | запрос | где | описание\n";
  const rows = list.map((e) =>
    [e.at, e.status ?? "---", `${e.method} ${e.path}`, e.where, e.message.replace(/\s+/g, " ")].join(" | "));
  return head + rows.join("\n") + "\n";
}
