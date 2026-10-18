// Ошибка запроса к бэкенду в одном формате для всего фронта.

export class ApiError extends Error {
  constructor(
    public status: number | null, // null — сервер недоступен (нет ответа)
    public method: string,
    public path: string,
    message: string,
  ) {
    super(message);
  }
}

/** Привести что угодно к ApiError (например, исключение из чужого кода) */
export const toApiError = (e: unknown): ApiError =>
  e instanceof ApiError ? e : new ApiError(null, "?", "?", e instanceof Error ? e.message : String(e));
