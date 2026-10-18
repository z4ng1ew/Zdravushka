import asyncio

from app import config
from app.stand_client import StandClient, StandError


async def main():
    t = config.TECH_CLIENT
    api = StandClient()
    print("Технический клиент:", t)
    try:
        found = await api.find_client(t["last_name"], t["first_name"], t["birth_date"])
        print("GET /clients:", "найден id=%s" % found["id"] if found else "не найден")
        if not found:
            created = await api.create_client(t["last_name"], t["first_name"], t["birth_date"], t["middle_name"],
                                              comment="Технический клиент для срочных заявок без идентификации")
            print("POST /clients: создан id=%s" % created["id"])
    except StandError as e:
        print(f"ОШИБКА стенда: {e.status} {e.message}")
        print("Попробуйте другую дату: TECH_CLIENT_BIRTH_DATE=01.01.1980 python -m scripts.check_tech_client")


if __name__ == "__main__":
    asyncio.run(main())
