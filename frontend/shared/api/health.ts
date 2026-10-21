// Состояние сервиса: GET /api/health → режим МИС, ИИ-сервисы, телефония.

import type { Health } from "../types/chat";
import { request } from "./http";
import { parseHealth } from "./parseChat";

export const getHealth = (): Promise<Health> => request("GET", "/api/health", "состояние сервера", { parse: parseHealth });
