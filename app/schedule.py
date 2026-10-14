from datetime import date, datetime, timedelta, timezone

from app import config

TZ = timezone(timedelta(hours=config.STAND_TZ_OFFSET_HOURS))

DATE_FMT = "%d.%m.%Y"
DT_FMT = "%d.%m.%Y %H:%M"

PRIMARY = {"терапевт", "педиатр", "врач общей практики"}

HOLIDAYS = {date(2026, 11, 4), date(2026, 12, 31), date(2027, 1, 1)}


def now() -> datetime:
    return datetime.now(TZ).replace(tzinfo=None)


def to_api(dt: datetime) -> str:
    return dt.strftime(DT_FMT)


def from_api(s: str) -> datetime:
    return datetime.strptime(s, DT_FMT)


def is_primary(specialty: str) -> bool:
    return specialty.strip().lower() in PRIMARY


def slot_minutes(specialty: str) -> int:
    return 15 if is_primary(specialty) else 20


def is_working_day(d: date) -> bool:
    return d.weekday() < 6 and d not in HOLIDAYS


def working_hours(doctor: dict, d: date) -> tuple[int, int] | None:
    if not is_working_day(d):
        return None
    if d.weekday() == 5:
        return (9, 15) if is_primary(doctor["specialty"]) else None
    return (8, 14) if doctor["id"] % 2 == 0 else (14, 20)


def day_slots(doctor: dict, d: date) -> list[datetime]:
    hours = working_hours(doctor, d)
    if not hours:
        return []
    step = timedelta(minutes=slot_minutes(doctor["specialty"]))
    t = datetime(d.year, d.month, d.day, hours[0])
    end = datetime(d.year, d.month, d.day, hours[1])
    slots = []
    while t + step <= end:
        slots.append(t)
        t += step
    return slots


def is_valid_slot(doctor: dict, dt: datetime) -> bool:
    return dt > now() and dt in day_slots(doctor, dt.date())


def pgg_deadline(specialty: str, start: datetime) -> datetime:
    if is_primary(specialty):
        return start + timedelta(hours=24)
    d, left = start.date(), 14
    while left > 0:
        d += timedelta(days=1)
        if d.weekday() < 5 and d not in HOLIDAYS:
            left -= 1
    return datetime(d.year, d.month, d.day, 23, 59)


PARTS_OF_DAY = {"утро": (7, 12), "день": (12, 16), "вечер": (16, 21)}


def find_free_slots(doctors: list[dict], busy: set[tuple[int, str]],
                    date_from: date | None = None, date_to: date | None = None,
                    part_of_day: str | None = None, limit: int = 3,
                    search_days: int = 21) -> list[tuple[dict, datetime]]:
    start = now() + timedelta(minutes=30)
    day = max(date_from or start.date(), start.date())
    last = date_to or (day + timedelta(days=search_days))
    hours = PARTS_OF_DAY.get(part_of_day) if part_of_day else None

    found = []
    while day <= last and len(found) < limit:
        candidates = []
        for doc in doctors:
            for slot in day_slots(doc, day):
                if slot < start:
                    continue
                if hours and not (hours[0] <= slot.hour < hours[1]):
                    continue
                if (doc["id"], to_api(slot)) in busy:
                    continue
                candidates.append((slot, doc))
                break
        for slot, doc in sorted(candidates, key=lambda x: x[0]):
            if len(found) < limit:
                found.append((doc, slot))
        day += timedelta(days=1)
    return found


WEEKDAYS_ACC = ["в понедельник", "во вторник", "в среду", "в четверг",
                "в пятницу", "в субботу", "в воскресенье"]
MONTHS_GEN = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля",
              "августа", "сентября", "октября", "ноября", "декабря"]
DAY_ORDINALS = ["", "первого", "второго", "третьего", "четвёртого", "пятого", "шестого",
                "седьмого", "восьмого", "девятого", "десятого", "одиннадцатого",
                "двенадцатого", "тринадцатого", "четырнадцатого", "пятнадцатого",
                "шестнадцатого", "семнадцатого", "восемнадцатого", "девятнадцатого",
                "двадцатого", "двадцать первого", "двадцать второго", "двадцать третьего",
                "двадцать четвёртого", "двадцать пятого", "двадцать шестого",
                "двадцать седьмого", "двадцать восьмого", "двадцать девятого",
                "тридцатого", "тридцать первого"]
UNITS = ["ноль", "один", "два", "три", "четыре", "пять", "шесть", "семь", "восемь",
         "девять", "десять", "одиннадцать", "двенадцать", "тринадцать", "четырнадцать",
         "пятнадцать", "шестнадцать", "семнадцать", "восемнадцать", "девятнадцать"]
TENS = {2: "двадцать", 3: "тридцать", 4: "сорок", 5: "пятьдесят"}


def number_words(n: int) -> str:
    if n < 20:
        return UNITS[n]
    tens, units = divmod(n, 10)
    return TENS[tens] + (f" {UNITS[units]}" if units else "")


def say_time(dt: datetime) -> str:
    h = number_words(dt.hour)
    if dt.minute == 0:
        return f"{h} ноль-ноль"
    if dt.minute < 10:
        return f"{h} ноль {number_words(dt.minute)}"
    return f"{h} {number_words(dt.minute)}"


def say_date(d: date) -> str:
    base = f"{WEEKDAYS_ACC[d.weekday()]}, {DAY_ORDINALS[d.day]} {MONTHS_GEN[d.month - 1]}"
    today = now().date()
    if d == today:
        return f"сегодня, {base}"
    if d == today + timedelta(days=1):
        return f"завтра, {base}"
    return base


def say_slot(dt: datetime) -> str:
    return f"{say_date(dt.date())}, в {say_time(dt)}"