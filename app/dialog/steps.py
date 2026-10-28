# Общие шаги сценариев: узнать пациента, подобрать время, выбрать вариант или запись.
import difflib
import re
from datetime import datetime, timedelta

from app import schedule
from app.dialog.common import escalate, reply, task_done
from app.dialog.mis import busy_slots, client_visits, identify
from app.models import Booking, ChatResponse, Escalation
from app.dialog.session import Session


def short_name(name: str) -> str:
    """«Ковалёва Людмила Петровна» → «Ковалёва Л. П.» — короче для голоса."""
    parts = name.split()
    return " ".join([parts[0]] + [f"{p[0]}." for p in parts[1:]])


def is_same_doctor(full_name: str, wanted: str) -> bool:
    """«Дорохов Сергей Анатольевич» и «Дорохову» — один врач (сравниваем основу фамилии)."""
    a = full_name.split()[0].lower().replace("ё", "е")
    b = wanted.split()[0].lower().replace("ё", "е")
    n = max(4, min(len(a), len(b)) - 2)
    if a[:n] == b[:n]:
        return True
    # Ошибка распознавания в одной букве: «Верещакин» → Верещагин (живой звонок 21.10)
    return len(b) >= 6 and difflib.SequenceMatcher(None, a, b[:len(a) + 1]).ratio() >= 0.85


def wanted_specialty(wanted: str) -> str | None:
    """Специальность врача, которого пациент назвал по фамилии."""
    doc = next((d for d in schedule.demo_doctors() if is_same_doctor(d["full_name"], wanted)), None)
    return doc["specialty"] if doc else None


def room(name: str) -> str:
    doc = schedule.excel_doctor(name) or {}
    return f", кабинет {doc['cabinet']}" if doc.get("cabinet") else ""


def make_booking(doc: dict, slot: datetime) -> Booking:
    return Booking(doctor_id=doc["id"], doctor_name=doc["full_name"], specialty=doc["specialty"],
                   scheduled_at=schedule.to_api(slot), spoken=schedule.say_slot(slot))


def visit_booking(v: dict) -> Booking:
    dt = schedule.from_api(v["scheduled_at"])
    return Booking(visit_id=v["id"], doctor_id=v["doctor"]["id"], doctor_name=v["doctor"]["full_name"],
                   specialty=v["doctor"]["specialty"], scheduled_at=v["scheduled_at"],
                   spoken=schedule.say_slot(dt), status=v["status"])


ID_ATTEMPTS = 3  # столько раз пробуем узнать пациента, потом — регистратор (R-07)


# ---------- Возраст пациента и врачи (взрослые 18+ / дети 0–17) ----------
# Для проверяющего: найдено на живом звонке — 17-летнего пациента записали к травматологу «Взрослые 18+».
# Теперь после идентификации врачи фильтруются по полю «Пациенты» из расписания поликлиники:
# ребёнка — к детскому специалисту той же профили (иначе к педиатру), взрослого — не к детскому врачу.
# Тесты: test_minor_is_booked_to_children_doctor, test_adult_is_not_booked_to_pediatrician.

def patient_age(s: Session) -> int | None:
    raw = s.fields.get("birth_date") or (s.client or {}).get("birth_date")
    try:
        born = datetime.strptime(str(raw), "%d.%m.%Y").date()
    except ValueError:
        return None
    today = schedule.now().date()
    return today.year - born.year - ((today.month, today.day) < (born.month, born.day))


def fits_age(doctor: dict, age: int | None) -> bool:
    patients = ((schedule.excel_doctor(doctor["full_name"]) or {}).get("patients") or "").lower()
    if age is None or not patients or "дети и взрослые" in patients:
        return True
    return "дет" in patients if age < 18 else not patients.startswith("дети")


def age_specialty(specialty: str, age: int | None) -> str | None:
    """Специальность для возраста пациента, если запрошенная ему не подходит."""
    if age is None:
        return None
    if age >= 18:
        return "Терапевт" if specialty == "Педиатр" else None
    wanted = specialty.lower()
    for spec in schedule.specialties():
        low = spec.lower()
        if low.startswith("детск") and any(len(w) > 5 and w in wanted for w in re.split(r"[\s\-()]+", low)[1:]):
            return spec
    return "Педиатр"


_PATRONYMIC_END = ("ич", "вна", "чна", "ична", "оглы", "кызы")  # «Ильич», «Петрович», «Кузьминична»


def _take_middle_name(s: Session) -> bool | None:
    """Ответ на вопрос об отчестве. True — понятно (записали отчество или «нет»), None — не поняли."""
    if re.search(r"\b(нет|без отчества|не имею|отсутствует)\b", s.text):
        s.fields["_no_middle"] = True
        return True
    words = [w for w in re.findall(r"[а-яё\-]{3,}", s.text) if w not in ("отчество", "моё", "мое", "меня")]
    word = next((w for w in words if w.endswith(_PATRONYMIC_END)), words[0] if len(words) == 1 else None)
    if not word:
        return None
    s.fields["middle_name"] = word.title()
    return True


def date_problem(text: str) -> str | None:
    """Почему дата рождения не подходит — чтобы сказать пациенту прямо, а не просто «повторите»."""
    m = re.search(r"\b(19\d\d|20\d\d)\b", text)
    if m and int(m.group(1)) > schedule.now().year:
        return "Дата рождения не может быть в будущем."
    if m and re.search(r"\b\d{1,2}\s+(январ|феврал|март|апрел|ма[йя]|июн|июл|август|сентябр|октябр|ноябр|декабр)", text):
        return "Такой даты нет в календаре — проверьте, пожалуйста, число."
    return None


async def need_identity(s: Session, create: bool = True) -> ChatResponse | None:
    """Спрашиваем ФИО и дату рождения, пока не узнаем пациента. None — пациент известен.
    Не получается (дата не распознаётся, пациента нет в МИС) — после ID_ATTEMPTS попыток перевод (R-07)."""
    if s.client:
        return None
    c = s.fields
    if not (c.get("last_name") and c.get("first_name")):
        if s.step == "identity":
            s.id_attempts += 1
            if s.id_attempts >= ID_ATTEMPTS:
                return await _identity_failed(s, "не удалось распознать ФИО")
        s.step = "identity"
        if c.get("birth_date") or c.get("last_name"):  # часть уже назвали — просим только недостающее
            return reply(s, "Спасибо. Теперь назовите фамилию и имя пациента полностью.")
        return reply(s, "Хорошо. Назовите, пожалуйста, фамилию, имя, отчество и дату рождения.")
    # Полное ФИО (по требованию заказчика на живой проверке): отчество спрашиваем отдельно,
    # если его не назвали; нет отчества — пациент говорит «нет», и это фиксируется.
    if not c.get("middle_name") and not c.get("_no_middle"):
        if not (s.step == "middle_name" and _take_middle_name(s)):
            s.step = "middle_name"
            return reply(s, "Назовите, пожалуйста, отчество пациента. Если отчества нет, скажите «нет».",
                         explanation="Для точного поиска в МИС нужны фамилия, имя и отчество.")
    if not c.get("birth_date"):
        again = s.step == "birth_date"
        s.step = "birth_date"
        if s.fields.get("_birth_year") and not date_problem(s.text):
            if again:
                s.id_attempts += 1
                if s.id_attempts >= ID_ATTEMPTS:
                    return await _identity_failed(s, "не удалось распознать дату рождения")
            return reply(s, "Год записала. Назовите, пожалуйста, число и месяц рождения.")
        if again:  # не поняли с первого раза (например, назвали только год) — подсказываем формат
            s.id_attempts += 1
            if s.id_attempts >= ID_ATTEMPTS:
                return await _identity_failed(s, "не удалось распознать дату рождения")
            problem = date_problem(s.text)
            return reply(s, (problem + " " if problem else "") + "Назовите дату рождения полностью: число, месяц и год. "
                            "Например: первое января тысяча девятьсот восемьдесят пятого.",
                         explanation=problem or "Для поиска в МИС нужна полная дата рождения.")
        return reply(s, "Назовите дату рождения пациента.")
    if await identify(s, create=create):
        return None
    # Пациента с такими данными нет в МИС: даём перепроверить, потом — регистратор
    s.id_attempts += 1
    for key in ("last_name", "first_name", "middle_name", "birth_date"):
        c.pop(key, None)
    if s.id_attempts >= ID_ATTEMPTS - 1:
        return await _identity_failed(s, "пациент не найден в МИС")
    s.step = "identity"
    return reply(s, "Не нашла пациента с такими данными. Повторите, пожалуйста, фамилию, имя и полную дату рождения.",
                 explanation="Поиск в МИС по фамилии, имени и дате рождения не дал результата.")


async def _identity_failed(s: Session, why: str) -> ChatResponse:
    return await escalate(s, Escalation(rule="R-07", reason="пациент не идентифицирован", priority="P3",
                                        summary=f"Не удалось идентифицировать пациента: {why}"))


async def offer_slots(s: Session, doctors: list[dict], exclude: str | None = None) -> ChatResponse:
    """Ищем до трёх вариантов времени с учётом пожеланий и предлагаем пациенту."""
    c = s.fields
    busy = await busy_slots(s)
    if exclude:
        busy.add(exclude)
    want = datetime.strptime(c["date"], "%d.%m.%Y").date() if c.get("date") else None
    found = schedule.find_free_slots(doctors, busy, date_from=want, date_to=want,
                                     part_of_day=c.get("part_of_day")) if want else []
    note = ""
    if want and not found:
        note = "На этот день свободного времени нет. "
    if not found:
        found = schedule.find_free_slots(doctors, busy, date_from=want, part_of_day=c.get("part_of_day"))
    if not found and c.get("part_of_day"):
        found = schedule.find_free_slots(doctors, busy, date_from=want)
    if not found:
        return await escalate(s, Escalation(rule="R-08", reason="лист ожидания", priority="P3",
                                       summary="Нет свободного времени в ближайший месяц — лист ожидания"))
    s.options = [make_booking(d, t) for d, t in found]
    s.step = "choose_slot"
    words = ["первый", "второй", "третий"]
    # В перечне — только фамилия врача: инициалы «С. А.» синтез проглатывает (звонок 28.10);
    # полное ФИО звучит при подтверждении «Записываю: … Верно?»
    variants = "; ".join(f"{words[i]} — {o.spoken}, врач {o.doctor_name.split()[0]}"
                         for i, o in enumerate(s.options))
    return reply(s, f"{note}Есть свободное время: {variants.rstrip('.')}. Какой вариант удобен?",
                 options=s.options, source="расписание + МИС",
                 explanation="Время свободно по графику врача и в МИС нет записи на этот слот; "
                             "сроки — по программе госгарантий.")


def pick(s: Session, nl: dict, key: str) -> object | None:
    """Выбор варианта по номеру («второй») из списка s[key]."""
    items = getattr(s, key) or []
    if nl["choice"] and nl["choice"] <= len(items):
        return items[nl["choice"] - 1]
    if len(items) == 1 and nl["answer"] == "yes":
        return items[0]
    return None


def pick_by_details(s: Session, text: str):
    """Вариант из списка по названному времени («14.20», «14:20») и/или фамилии врача. Один подходящий — он."""
    if not s.options:
        return None
    low = text.lower()
    times = {f"{int(h):02d}:{m}" for h, m in re.findall(r"\b(\d{1,2})[.:\s](\d{2})\b", low)}
    words = re.findall(r"[а-яё]{4,}", low)
    cands = list(s.options)
    if times:
        cands = [o for o in cands if o.scheduled_at[-5:] in times]
    by_doc = [o for o in cands if any(is_same_doctor(o.doctor_name, w) for w in words)]
    if by_doc:
        cands = by_doc
    elif not times:
        return None  # ни времени, ни врача из списка — это не выбор варианта
    return cands[0] if len(cands) == 1 else None


async def choose_slot(s: Session, nl: dict, doctors_for_retry) -> ChatResponse | None:
    """Шаг выбора времени: номер варианта → подтверждение; новый день/время → новый поиск."""
    # Пациент назвал сам вариант — время и/или врача из списка («в пятницу в 14.20, врач Рябинин»):
    # выбираем его, а не ищем заново (живой звонок 28.10: такой ответ дважды запускал новый поиск)
    chosen = pick_by_details(s, s.text)
    # Назван новый день («29 октября») — это новый поиск, даже если модель увидела в фразе «номер»
    if not chosen:
        chosen = None if (nl["date"] or nl["part_of_day"]) else pick(s, nl, "options")
    if chosen:
        s.chosen = chosen
        s.step = "confirm"
        return None
    if nl["date"] or nl["part_of_day"] or nl["answer"] == "no" or re.search(r"друг|ни один|никак|позже|не подход", s.text):
        if not (nl["date"] or nl["part_of_day"]) and s.options:
            # «другой день», «ни один не подходит» — ищем начиная со дня после последнего предложенного
            last = max(schedule.from_api(o.scheduled_at) for o in s.options)
            s.fields["date"] = (last + timedelta(days=1)).strftime("%d.%m.%Y")
        return await offer_slots(s, await doctors_for_retry())
    return reply(s, "Скажите номер варианта: первый, второй или третий. Или назовите другой день.",
                  options=s.options)


async def choose_visit(s: Session, nl: dict, verb: str) -> ChatResponse | None:
    """Находим записи пациента; если их несколько — просим выбрать."""
    if s.visits is None:
        s.visits = await client_visits(s)
    visits = s.visits
    if not visits:
        return task_done(s, "У вас нет предстоящих записей.", "справка")
    if len(visits) == 1:
        s.visit = visits[0]
        return None
    if s.step == "choose_visit":
        v = pick(s, nl, "visits")
        if v:
            s.visit = v
            return None
    s.step = "choose_visit"
    words = ["первая", "вторая", "третья"]
    items = [visit_booking(v) for v in visits[:3]]
    listing = "; ".join(f"{words[i]} — {b.specialty.lower()}, {b.spoken}" for i, b in enumerate(items))
    return reply(s, f"У вас несколько записей: {listing}. Какую {verb}?", options=items)
