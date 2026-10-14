import asyncio
import time
from collections import deque

import httpx

from app import config


class StandError(Exception):
    pass

    def __init__(self, status: int, code: str, message: str):
        super().__init__(f"{status} {code}: {message}")
        self.status = status
        self.code = code
        self.message = message


class RateLimiter:

    def __init__(self, max_calls: int, period: float = 60.0):
        self.max_calls = max_calls
        self.period = period
        self.calls = deque()
        self.lock = asyncio.Lock()

    async def wait(self):
        async with self.lock:
            while True:
                now = time.monotonic()
                while self.calls and now - self.calls[0] >= self.period:
                    self.calls.popleft()
                if len(self.calls) < self.max_calls:
                    self.calls.append(now)
                    return
                await asyncio.sleep(self.period - (now - self.calls[0]) + 0.05)


class StandClient:
    def __init__(self, base_url: str = config.STAND_URL, token: str = config.STAND_TOKEN,
                 transport: httpx.AsyncBaseTransport | None = None):
        self.http = httpx.AsyncClient(
            base_url=base_url,
            headers={"Authorization": f"Bearer {token}"},
            timeout=config.STAND_TIMEOUT,
            transport=transport,
        )
        self.limiter = RateLimiter(config.STAND_RATE_LIMIT)
        self._doctors: list[dict] | None = None

    async def close(self):
        await self.http.aclose()

    async def _request(self, method: str, path: str, **kwargs):
        for attempt in range(3):
            await self.limiter.wait()
            resp = await self.http.request(method, path, **kwargs)

            if resp.status_code == 429:
                delay = float(resp.headers.get("Retry-After", "10"))
                await asyncio.sleep(delay)
                continue

            if resp.status_code >= 400:
                try:
                    body = resp.json()
                except ValueError:
                    body = {}
                raise StandError(resp.status_code,
                                 body.get("code", "НЕИЗВЕСТНО"),
                                 body.get("message", resp.text))
            return resp.json()

        raise StandError(429, "ПРЕВЫШЕН_ЛИМИТ", "Стенд трижды ответил 429")

    async def _get_all(self, path: str, params: dict | None = None) -> list[dict]:
        params = dict(params or {})
        result, offset = [], 0
        while True:
            page = await self._request("GET", path, params={**params, "limit": 50, "offset": offset})
            items = page if isinstance(page, list) else page.get("items", [])
            result.extend(items)
            if len(items) < 50:
                return result
            offset += 50


    async def doctors(self, refresh: bool = False) -> list[dict]:
        if self._doctors is None or refresh:
            self._doctors = await self._get_all("/doctors")
        return self._doctors

    async def active_doctors(self, specialty: str | None = None) -> list[dict]:
        result = [d for d in await self.doctors() if d["is_active"]]
        if specialty:
            s = specialty.strip().lower()
            result = [d for d in result if d["specialty"].lower() == s]
        return result


    async def find_client(self, last_name: str, first_name: str, birth_date: str) -> dict | None:
        found = await self._get_all("/clients", {
            "last_name": last_name.strip().title(),
            "first_name": first_name.strip().title(),
            "birth_date": birth_date,
        })
        return found[0] if found else None

    async def create_client(self, last_name: str, first_name: str, birth_date: str,
                            middle_name: str | None = None, comment: str | None = None) -> dict:
        body = {"last_name": last_name.strip().title(),
                "first_name": first_name.strip().title(),
                "birth_date": birth_date}
        if middle_name:
            body["middle_name"] = middle_name.strip().title()
        if comment:
            body["comment"] = comment
        return await self._request("POST", "/clients", json=body)

    async def update_client_comment(self, client_id: int, comment: str) -> dict:
        return await self._request("PATCH", f"/clients/{client_id}", json={"comment": comment})


    async def create_visit(self, client_id: int, doctor_id: int, scheduled_at: str) -> dict:
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
        body = {"scheduled_at": scheduled_at}
        if doctor_id is not None:
            body["doctor_id"] = doctor_id
        return await self._request("PATCH", f"/visits/{visit_id}", json=body)

    async def cancel_visit(self, visit_id: int) -> dict:
        return await self._request("PATCH", f"/visits/{visit_id}", json={"status": "Отменена"})

    async def is_slot_taken(self, doctor_id: int, scheduled_at: str) -> bool:
        day = scheduled_at.split(" ")[0]
        visits = await self.list_visits(doctor_id=doctor_id, status="Запланирована",
                                        date_from=day, date_to=day)
        return any(v["scheduled_at"] == scheduled_at for v in visits)
