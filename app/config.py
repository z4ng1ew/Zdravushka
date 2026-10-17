import os
from dotenv import load_dotenv

load_dotenv()
load_dotenv("/opt/hackathon/ai.env", override=False)

STAND_URL = os.getenv("STAND_URL", "https://crm-med-mock.dbi-testing.ru/api/v1")

STAND_TOKEN = os.getenv("STAND_TOKEN") or os.getenv("DBI_API_TOKEN", "")

STAND_RATE_LIMIT = int(os.getenv("STAND_RATE_LIMIT", "9"))

STAND_TIMEOUT = float(os.getenv("STAND_TIMEOUT", "5"))

STAND_TZ_OFFSET_HOURS = 4

ASSISTANT_NAME = "Здравушка"


LLM_URL = os.getenv("LLM_URL") or os.getenv("OPENAI_BASE_URL", "")
LLM_TOKEN = os.getenv("LLM_TOKEN") or os.getenv("OPENAI_API_KEY", "")
LLM_MODEL = os.getenv("LLM_MODEL", "ai-sage/GigaChat3-10B-A1.8B")
LLM_TIMEOUT = float(os.getenv("LLM_TIMEOUT", "30"))

STT_URL = os.getenv("STT_URL") or os.getenv("OPENAI_BASE_URL", "")
STT_TOKEN = os.getenv("STT_TOKEN") or os.getenv("OPENAI_API_KEY", "")
STT_MODEL = os.getenv("STT_MODEL", "openai/whisper-large-v3")
STT_TIMEOUT = float(os.getenv("STT_TIMEOUT", "30"))

TTS_URL = os.getenv("TTS_URL", "")
TTS_TOKEN = os.getenv("TTS_TOKEN", "")
TTS_MODEL = os.getenv("TTS_MODEL", "tts-1")
TTS_VOICE = os.getenv("TTS_VOICE", "")
TTS_TIMEOUT = float(os.getenv("TTS_TIMEOUT", "30"))

TTS_BACKEND = os.getenv("TTS_BACKEND", "piper")
PIPER_MODEL = os.getenv("PIPER_MODEL", "data/voices/ru_RU-irina-medium.onnx")

TELEPHONY_ENABLED = os.getenv("TELEPHONY_ENABLED", "1") == "1"
AUDIOSOCKET_HOST = os.getenv("AUDIOSOCKET_HOST", "127.0.0.1")
AUDIOSOCKET_PORT = int(os.getenv("AUDIOSOCKET_PORT", "9092"))
REMINDER_ENDPOINT = os.getenv("REMINDER_ENDPOINT", "PJSIP/phone-049@gateway")
VAD_THRESHOLD = float(os.getenv("VAD_THRESHOLD", "500"))
END_OF_SPEECH_MS = int(os.getenv("END_OF_SPEECH_MS", "800"))
MIN_SPEECH_MS = int(os.getenv("MIN_SPEECH_MS", "250"))
BARGE_IN_MS = int(os.getenv("BARGE_IN_MS", "400"))
SILENCE_PROMPT_SEC = float(os.getenv("SILENCE_PROMPT_SEC", "5"))
SILENCE_HANGUP_SEC = float(os.getenv("SILENCE_HANGUP_SEC", "5"))

TECH_CLIENT = {"last_name": "Срочный", "first_name": "Вызов", "middle_name": "Иванович", "birth_date": "01.01.1900"}
