import os
from dotenv import load_dotenv

load_dotenv()

STAND_URL = os.getenv("STAND_URL", "https://crm-med-mock.dbi-testing.ru/api/v1")
STAND_TOKEN = os.getenv("STAND_TOKEN", "")
STAND_RATE_LIMIT = int(os.getenv("STAND_RATE_LIMIT", "9"))
STAND_TIMEOUT = float(os.getenv("STAND_TIMEOUT", "5"))
STAND_TZ_OFFSET_HOURS = 4

ASSISTANT_NAME = "Здравушка"