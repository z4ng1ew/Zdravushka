// Состояние сервиса: GET /api/health → режим МИС, ИИ-сервисы, телефония.

import type { Health } from "../types/chat";
import { request } from "./http";

export const getHealth = () => request<Health>("GET", "/api/health", "состояние сервера");
