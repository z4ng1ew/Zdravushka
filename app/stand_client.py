# Клиент API стенда «Регистратура».
# Здесь собрано всё общение с МИС: пациенты, врачи, записи.
# Остальной код не знает про HTTP — он просто вызывает функции этого класса.
import asyncio
import time
from collections import deque

import httpx

from app import config
from app.resilience import CircuitBreaker, backoff

IDEMPOTENT = ("GET",)  # повторять безопасно только чтение: повтор POST мог бы создать вторую запись


class StandError(Exception):
    """Ошибка от стенда. Хранит код ответа (400, 404, 409...) и текст на русском."""

    def __init__(self, status: int, code: str, message: str):
        super().__init__(f"{status} {code}: {message}")
        self.status = status    # HTTP-код ответа, например 409
        self.code = code        # код стенда, например КОНФЛИКТ_СТАТУСА
        self.message = message  # описание ошибки на русском


def _retry_after(resp: httpx.Response) -> float:
    try:
        return max(0.0, float(resp.headers.get("Retry-After", "5")))
    except ValueError:
        return 5.0


def _error_body(resp: httpx.Response) -> tuple[str, str]:
    """Код и текст ошибки стенда; если тело не JSON — общий код и начало текста."""
    try:
        body = resp.json()
        if isinstance(body, dict):
            return body.get("code", "НЕИЗВЕСТНО"), body.get("message", resp.text[:200])
    except ValueError:
        pass
    return "НЕИЗВЕСТНО", resp.text[:200]


class RateLimiter:
    """Следит, чтобы мы не отправили больше N запросов за 60 секунд."""

    def __init__(self, max_calls: int, period: float = 60.0):
        self.max_calls = max_calls
        self.period = period
        self.calls = deque()        # время отправки последних запросов
        self.lock = asyncio.Lock()  # чтобы два запроса одновременно не сломали подсчёт

    async def wait(self):
        # Ждём вне блокировки (техчекпоинт 23.10): раньше один ожидающий запрос держал замок,
        # и все остальные звонки стояли за ним по очереди — «подождать 10 с» превращалось в минуту.
        while True:
            async with self.lock:
                now = time.monotonic()
                # выкидываем запросы старше 60 секунд — они уже не считаются
                while self.calls and now - self.calls[0] >= self.period:
                    self.calls.popleft()
                if len(self.calls) < self.max_calls:
                    self.calls.append(now)
                    return
                pause = self.period - (now - self.calls[0]) + 0.05
            await asyncio.sleep(pause)  # лимит исчерпан: ждём, пока самый старый запрос «выйдет» из окна


class StandClient:
    def __init__(self, base_url: str = config.STAND_URL, token: str = config.STAND_TOKEN,
                 transport: httpx.AsyncBaseTransport | None = None):
        # transport нужен только для тестов (подменяем настоящий стенд заглушкой)
        self.http = httpx.AsyncClient(
            base_url=base_url,
            headers={"Authorization": f"Bearer {token}"},
            timeout=config.STAND_TIMEOUT,
            transport=transport,
        )
        self.limiter = RateLimiter(config.STAND_RATE_LIMIT)
        self._doctors: list[dict] | None = None  # кэш справочника врачей
        self._doctors_at = 0.0                   # когда кэш загружен (для срока жизни)
        self.breaker = CircuitBreaker("МИС", failures=3, cooldown=30)

    async def close(self):
        await self.http.aclose()

    async def _request(self, method: str, path: str, **kwargs):
        """Единая точка отправки запросов: лимит, предохранитель, повторы, разбор ошибок.

        Стратегия по видам сбоев:
          429             — ждём Retry-After, но не дольше STAND_MAX_RETRY_AFTER (пациент на линии);
          таймаут, обрыв  — GET повторяем с паузой; POST/PATCH не повторяем (не создать дубль записи);
          5xx             — GET повторяем, потом считаем стенд недоступным;
          4xx             — ошибка данных, не повторяем, отдаём код и текст стенда;
          не JSON в ответе — «неверный ответ», не повторяем.
        После 3 сбоев подряд предохранитель размыкается на 30 секунд — ответ «недоступно» мгновенный.
        """
        if self.breaker.is_open:
            raise StandError(503, "МИС_НЕДОСТУПНА", "стенд не отвечал несколько раз подряд, пауза 30 секунд")
        retries = config.STAND_RETRIES if method in IDEMPOTENT else 0
        for attempt in range(retries + 3):
            await self.limiter.wait()
            try:
                resp = await self.http.request(method, path, **kwargs)
            except httpx.HTTPError as e:  # таймаут, обрыв соединения
                if attempt < retries:
                    await backoff(attempt)
                    continue
                self.breaker.failure()
                raise StandError(0, "НЕТ_ОТВЕТА", f"{type(e).__name__}: стенд не ответил") from e

            if resp.status_code == 429:
                delay = _retry_after(resp)
                if delay > config.STAND_MAX_RETRY_AFTER or attempt >= 2:
                    raise StandError(429, "ПРЕВЫШЕН_ЛИМИТ", f"стенд просит подождать {delay:.0f} с")
                await asyncio.sleep(delay)
                continue

            if resp.status_code >= 500:
                if attempt < retries:
                    await backoff(attempt)
                    continue
                self.breaker.failure()
                raise StandError(resp.status_code, *_error_body(resp))

            if resp.status_code >= 400:
                self.breaker.success()  # стенд жив, ошибка в данных
                raise StandError(resp.status_code, *_error_body(resp))

            try:
                data = resp.json()
            except ValueError as e:
                self.breaker.failure()
                raise StandError(502, "НЕВЕРНЫЙ_ОТВЕТ", "стенд вернул не JSON") from e
            self.breaker.success()
            return data
        raise StandError(429, "ПРЕВЫШЕН_ЛИМИТ", "стенд несколько раз подряд ответил 429")

    async def _get_all(self, path: str, params: dict | None = None) -> list[dict]:
        """Списки отдаются по 50 штук. Забираем все страницы подряд."""
        params = dict(params or {})
        result, offset = [], 0
        while True:
            page = await self._request("GET", path, params={**params, "limit": 50, "offset": offset})
            items = page if isinstance(page, list) else page.get("items", [])
            result.extend(items)
            if len(items) < 50:
                return result
            offset += 50

    # ---------- Врачи ----------

    async def doctors(self, refresh: bool = False) -> list[dict]:
        """Справочник врачей. Загружаем один раз и держим в памяти (экономим лимит)."""
        stale = time.monotonic() - self._doctors_at > config.DOCTORS_CACHE_TTL
        if self._doctors is None or refresh or stale:
            self._doctors = await self._get_all("/doctors")
            self._doctors_at = time.monotonic()
        return self._doctors

    def invalidate_doctors(self):
        """Сбросить кэш справочника (например, стенд сообщил, что врач деактивирован)."""
        self._doctors = None

    async def active_doctors(self, specialty: str | None = None) -> list[dict]:
        """Только активные врачи, при желании — одной специальности."""
        result = [d for d in await self.doctors() if d["is_active"]]
        if specialty:
            s = specialty.strip().lower()
            result = [d for d in result if d["specialty"].lower() == s]
        return result

    # ---------- Пациенты ----------

    async def find_client(self, last_name: str, first_name: str, birth_date: str) -> dict | None:
        """Ищем пациента по фамилии, имени и дате рождения (ДД.ММ.ГГГГ)."""
        found = await self._get_all("/clients", {
            "last_name": last_name.strip().title(),
            "first_name": first_name.strip().title(),
            "birth_date": birth_date,
        })
        return found[0] if found else None

    async def create_client(self, last_name: str, first_name: str, birth_date: str,
                            middle_name: str | None = None, comment: str | None = None) -> dict:
        """Заводим пациента. Если такой уже есть — стенд вернёт существующую карточку."""
        body = {"last_name": last_name.strip().title(),
                "first_name": first_name.strip().title(),
                "birth_date": birth_date}
        if middle_name:
            body["middle_name"] = middle_name.strip().title()
        if comment:
            body["comment"] = comment
        return await self._request("POST", "/clients", json=body)

    async def get_client(self, client_id: int) -> dict:
        return await self._request("GET", f"/clients/{client_id}")

    async def update_client_comment(self, client_id: int, comment: str) -> dict:
        return await self._request("PATCH", f"/clients/{client_id}", json={"comment": comment})

    # ---------- Записи на приём ----------

    async def create_visit(self, client_id: int, doctor_id: int, scheduled_at: str) -> dict:
        """Создаём запись. scheduled_at — строка 'ДД.ММ.ГГГГ ЧЧ:ММ' по GMT+4."""
        return await self._request("POST", "/visits", json={
            "client_id": client_id, "doctor_id": doctor_id, "scheduled_at": scheduled_at})

    async def list_visits(self, client_id: int | None = None, doctor_id: int | None = None,
                          status: str | None = None, date_from: str | None = None,
                          date_to: str | None = None) -> list[dict]:
        params = {k: v for k, v in {
            "client_id": client_id, "doctor_id": doctor_id, "status": status,
            "date_from": date_from, "date_to": date_to}.items() if v is not None}
        return await self._get_all("/visits", params)

    async def reschedule_visit(self, visit_id: int, scheduled_at: str,
                               doctor_id: int | None = None) -> dict:
        """Перенос: меняем время (и при необходимости врача) у той же записи."""
        body = {"scheduled_at": scheduled_at}
        if doctor_id is not None:
            body["doctor_id"] = doctor_id
        return await self._request("PATCH", f"/visits/{visit_id}", json=body)

    async def cancel_visit(self, visit_id: int) -> dict:
        """Отмена: запись не удаляется, а получает статус «Отменена»."""
        return await self._request("PATCH", f"/visits/{visit_id}", json={"status": "Отменена"})

    async def is_slot_taken(self, doctor_id: int, scheduled_at: str) -> bool:
        """Стенд не проверяет занятость — проверяем сами по своим записям к врачу."""
        day = scheduled_at.split(" ")[0]
        visits = await self.list_visits(doctor_id=doctor_id, status="Запланирована",
                                        date_from=day, date_to=day)
        return any(v["scheduled_at"] == scheduled_at for v in visits)

    # ---------- Заявки на соединение со специалистом ----------

    async def create_escalation(self, client_id: int, description: str) -> dict:
        """Фиксируем в МИС, что ассистент передал разговор человеку (перевод, вызов на дом)."""
        return await self._request("POST", "/escalations", json={
            "client_id": client_id, "description": description[:1000]})
