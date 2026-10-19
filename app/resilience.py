import asyncio
import time


class CircuitBreaker:

    def __init__(self, name: str, failures: int = 3, cooldown: float = 30.0):
        self.name, self.failures, self.cooldown = name, failures, cooldown
        self.count = 0
        self.opened_at: float | None = None

    @property
    def is_open(self) -> bool:
        if self.opened_at is None:
            return False
        if time.monotonic() - self.opened_at >= self.cooldown:
            self.opened_at, self.count = None, self.failures - 1
            return False
        return True

    def success(self):
        self.count, self.opened_at = 0, None

    def failure(self):
        self.count += 1
        if self.count >= self.failures:
            self.opened_at = time.monotonic()


async def backoff(attempt: int, base: float = 0.4, cap: float = 2.0):
    await asyncio.sleep(min(cap, base * (2 ** attempt)))
