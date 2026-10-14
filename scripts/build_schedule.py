import json
import sys
from datetime import datetime
from pathlib import Path

import openpyxl

OUT = Path("data/schedule.json")


def hhmm(t) -> str:
    return t.strftime("%H:%M") if hasattr(t, "strftime") else str(t)[:5]


def main(xlsx_path: str):
    print(f"Читаю {xlsx_path} ... (около минуты)")
    wb = openpyxl.load_workbook(xlsx_path, read_only=True)

    today = None
    for row in wb["Описание"].iter_rows(values_only=True):
        if row[0] == "Сегодня":
            today = row[1]
    today = today or datetime.now()

    doctors = {}
    for r in wb["Врачи"].iter_rows(min_row=2, values_only=True):
        if not r[0]:
            continue
        doctors[r[1]] = {
            "excel_id": r[0], "full_name": r[1], "department": r[2], "specialty": r[3],
            "patients": r[4], "cabinet": str(r[5]), "slot_min": int(r[6]), "schedule": r[7],
            "weekly": {},
        }

    days = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]
    for r in wb["График"].iter_rows(min_row=2, values_only=True):
        if r[1] in doctors:
            doctors[r[1]]["weekly"] = {d: v for d, v in zip(days, r[4:11]) if v and v != "—"}

    free: dict[str, dict[str, list[str]]] = {}
    count = 0
    for r in wb["Слоты"].iter_rows(min_row=2, values_only=True):
        day, fio, status = r[1], r[4], r[11]
        if not day or day < today or status != "Свободен":
            continue
        free.setdefault(fio, {}).setdefault(day.strftime("%d.%m.%Y"), []).append(hhmm(r[8]))
        count += 1

    OUT.parent.mkdir(parents=True, exist_ok=True)
    data = {"source": Path(xlsx_path).name, "today": today.strftime("%d.%m.%Y"),
            "doctors": list(doctors.values()), "free": free}
    OUT.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    print(f"Готово: {len(doctors)} врачей, {count} свободных слотов → {OUT} "
          f"({OUT.stat().st_size // 1024} КБ)")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Использование: python -m scripts.build_schedule путь/к/расписанию.xlsx")
        sys.exit(1)
    main(sys.argv[1])
