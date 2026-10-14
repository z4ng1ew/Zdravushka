import asyncio

from app import config
from app.stand_client import StandClient, StandError


async def main():
    if not config.STAND_TOKEN:
        print("Нет токена: впишите STAND_TOKEN в файл .env")
        return

    client = StandClient()
    try:
        doctors = await client.doctors()
        print(f"Врачей в справочнике: {len(doctors)}")
        by_specialty = {}
        for d in doctors:
            by_specialty.setdefault(d["specialty"], []).append(d)
        for specialty, items in sorted(by_specialty.items()):
            active = sum(1 for d in items if d["is_active"])
            print(f"  {specialty}: {len(items)} (активных {active})")

        visits = await client.list_visits()
        print(f"Записей у нашей команды: {len(visits)}")
    except StandError as e:
        print(f"Ошибка стенда: {e.status} {e.code} — {e.message}")
    finally:
        await client.close()


if __name__ == "__main__":
    asyncio.run(main())