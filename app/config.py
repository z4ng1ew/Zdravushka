import os
from dotenv import load_dotenv

load_dotenv()

STAND_URL = os.getenv("STAND_URL", "https://crm-med-mock.dbi-testing.ru/api/v1")

STAND_TOKEN = os.getenv("STAND_TOKEN", "")

STAND_RATE_LIMIT = int(os.getenv("STAND_RATE_LIMIT", "9"))

STAND_TIMEOUT = float(os.getenv("STAND_TIMEOUT", "5"))

STAND_TZ_OFFSET_HOURS = 4

ASSISTANT_NAME = "Здравушка"


LLM_URL = os.getenv("LLM_URL", "")
LLM_TOKEN = os.getenv("LLM_TOKEN", "")
LLM_MODEL = os.getenv("LLM_MODEL", "")
LLM_TIMEOUT = float(os.getenv("LLM_TIMEOUT", "30"))

STT_URL = os.getenv("STT_URL", "")
STT_TOKEN = os.getenv("STT_TOKEN", "")
STT_MODEL = os.getenv("STT_MODEL", "whisper-1")
STT_TIMEOUT = float(os.getenv("STT_TIMEOUT", "30"))

TTS_URL = os.getenv("TTS_URL", "")
TTS_TOKEN = os.getenv("TTS_TOKEN", "")
TTS_MODEL = os.getenv("TTS_MODEL", "tts-1")
TTS_VOICE = os.getenv("TTS_VOICE", "")
TTS_TIMEOUT = float(os.getenv("TTS_TIMEOUT", "30"))

TTS_BACKEND = os.getenv("TTS_BACKEND", "piper")
PIPER_MODEL = os.getenv("PIPER_MODEL", "data/voices/ru_RU-irina-medium.onnx")
