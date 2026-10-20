# Устойчивость к сбоям внешних сервисов (МИС, нейросети): автомат-предохранитель и повторы с паузой.
#
# Единая политика для всех внешних вызовов (значения — в app/config.py, применение — в указанных модулях):
#   Сервис              Таймаут  Повторы                         429                         Предохранитель   Запасной путь
#   МИС, чтение (GET)   5 с      2, пауза 0,4→0,8 с              Retry-After ≤ 8 с, иначе отказ  3 сбоя → 30 с   перевод R-06
#   МИС, запись         5 с      0 (повтор = риск дубля записи)  как выше                    общий с чтением  перевод R-06
#   LLM (понимание)     8 с      1, пауза 0,4 с                  повтор 1 раз                3 сбоя → 60 с    разбор по правилам
#   STT (распознавание) 15 с     1, пауза 0,4 с                  повтор 1 раз                —                «повторите, пожалуйста»
#   TTS внешний         30 с     1                               повтор 1 раз                —                Piper локально
# Шлюз нейросетей: не больше 2 одновременных запросов (семафор в app/ai.py) — третий получил бы 429.
# Пациент на линии не может ждать минуту: если сервис упал, быстро признаём это и переводим
# на регистратора, а не повторяем бесконечно.
import asyncio
import time


class CircuitBreaker:
    """Предохранитель: после N сбоев подряд сервис считается недоступным на cooldown секунд.
    Пока он «разомкнут», запросы не отправляются — ответ «недоступно» приходит мгновенно."""

    def __init__(self, name: str, failures: int = 3, cooldown: float = 30.0):
        self.name, self.failures, self.cooldown = name, failures, cooldown
        self.count = 0
        self.opened_at: float | None = None

    @property
    def is_open(self) -> bool:
        if self.opened_at is None:
            return False
        if time.monotonic() - self.opened_at >= self.cooldown:
            self.opened_at, self.count = None, self.failures - 1  # пробный запрос: ещё сбой — снова размыкаем
            return False
        return True

    def success(self):
        self.count, self.opened_at = 0, None

    def failure(self):
        self.count += 1
        if self.count >= self.failures:
            self.opened_at = time.monotonic()


async def backoff(attempt: int, base: float = 0.4, cap: float = 2.0):
    """Пауза перед повтором: 0,4 с, 0,8 с, 1,6 с… не больше cap."""
    await asyncio.sleep(min(cap, base * (2 ** attempt)))
