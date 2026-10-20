# Локальный адаптер МИС для интеграционных тестов и отладки без токена стенда.
# Включается явно: STAND_MODE=mock. В /api/health режим показывается как "mock",
# чтобы его нельзя было спутать с работой на настоящем стенде.
import json

import httpx

from app import schedule
from app.stand_client import RateLimiter, StandClient


class MockStand:
    """Имитация стенда «Регистратура» в памяти: те же адреса, коды ответов и ошибки, что у настоящего.
    Нужна для автотестов и для запуска без токена (STAND_MODE=mock). Логика ассистента при этом
    не меняется — он работает через тот же StandClient, что и с настоящим стендом."""

    def __init__(self, broken: bool = False):
        self.broken = broken
        self.doctors = [{"id": 100 + i, "full_name": d["full_name"], "specialty": d["specialty"], "is_active": True}
                        for i, d in enumerate(schedule.demo_doctors())]
        self.clients, self.visits, self.escalations = [], [], []

    def __call__(self, req: httpx.Request) -> httpx.Response:
        if self.broken:
            return httpx.Response(500, json={"code": "ВНУТРЕННЯЯ_ОШИБКА", "message": "сбой"})
        path, q = req.url.path.replace("/api/v1", ""), dict(req.url.params)
        body = json.loads(req.content) if req.content else {}
        if path == "/doctors":
            o = int(q["offset"])
            return httpx.Response(200, json=self.doctors[o:o + 50])
        if path == "/clients" and req.method == "GET":
            found = [c for c in self.clients if c["last_name"] == q.get("last_name")
                     and c["first_name"] == q.get("first_name") and c["birth_date"] == q.get("birth_date")]
            return httpx.Response(200, json=found)
        if path == "/clients" and req.method == "POST":
            for c in self.clients:
                if (c["last_name"], c["first_name"], c["birth_date"]) == (body["last_name"], body["first_name"], body["birth_date"]):
                    return httpx.Response(200, json=c)
            c = {"id": len(self.clients) + 1, "comment": None, **body}
            self.clients.append(c)
            return httpx.Response(201, json=c)
        if path.startswith("/clients/"):
            c = self.clients[int(path.split("/")[-1]) - 1]
            c.update(body)
            return httpx.Response(200, json=c)
        if path == "/visits" and req.method == "POST":
            doc = next(d for d in self.doctors if d["id"] == body["doctor_id"])
            v = {"id": len(self.visits) + 1, "client_id": body["client_id"], "doctor": doc,
                 "scheduled_at": body["scheduled_at"], "status": "Запланирована"}
            self.visits.append(v)
            return httpx.Response(201, json=v)
        if path == "/visits":
            res = [v for v in self.visits
                   if (not q.get("client_id") or str(v["client_id"]) == q["client_id"])
                   and (not q.get("status") or v["status"] == q["status"])]
            return httpx.Response(200, json=res if int(q.get("offset", 0)) == 0 else [])
        if path.startswith("/visits/"):
            v = self.visits[int(path.split("/")[-1]) - 1]
            if v["status"] != "Запланирована":
                return httpx.Response(409, json={"code": "КОНФЛИКТ_СТАТУСА", "message": "нельзя"})
            v.update(body)
            return httpx.Response(200, json=v)
        if path == "/escalations":
            e = {"id": len(self.escalations) + 1, **body}
            self.escalations.append(e)
            return httpx.Response(201, json=e)
        return httpx.Response(404, json={"code": "НЕ_НАЙДЕНО", "message": path})


def client(fake: "MockStand | None" = None) -> StandClient:
    """StandClient, который вместо сети ходит в MockStand."""
    api = StandClient(base_url="https://mock-stand/api/v1", token="mock",
                      transport=httpx.MockTransport(fake or MockStand()))
    api.limiter = RateLimiter(1000)  # у имитации нет лимита 10 запросов в минуту
    return api
