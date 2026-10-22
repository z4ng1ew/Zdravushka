# Настройки проекта. Все секреты (токены, ключи) берём из файла .env,
# чтобы они не попали в код и в репозиторий.
import os
from dotenv import load_dotenv

# Читаем файл .env из корня проекта и кладём его строки в переменные окружения
load_dotenv()
# На VM организаторов ключи лежат в /opt/hackathon/ai.env (DBI_API_TOKEN, OPENAI_*). Наш .env важнее.
load_dotenv("/opt/hackathon/ai.env", override=False)

# Адрес API стенда «Регистратура» (базовый путь /api/v1 из документации)
STAND_URL = os.getenv("STAND_URL", "https://crm-med-mock.dbi-testing.ru/api/v1")

# Токен команды для стенда. Пока его нет — строка пустая
# На VM организаторов токен уже лежит в DBI_API_TOKEN — берём его, если STAND_TOKEN не задан
STAND_TOKEN = os.getenv("STAND_TOKEN") or os.getenv("DBI_API_TOKEN", "")

# Режим МИС: stand — настоящий стенд (нужен токен); mock — имитация в памяти для отладки и тестов.
# Без токена и без mock ассистент не выдумывает записи, а честно переводит на регистратора (R-06).
STAND_MODE = os.getenv("STAND_MODE", "stand")

# Лимит стенда: не больше 10 запросов в минуту. Держим 9, чтобы был запас
STAND_RATE_LIMIT = int(os.getenv("STAND_RATE_LIMIT", "9"))

# Сколько секунд ждать ответа стенда. По регламенту (R-06) больше 5 секунд — это сбой
STAND_TIMEOUT = float(os.getenv("STAND_TIMEOUT", "5"))

# Повторы и предохранитель для МИС
STAND_RETRIES = int(os.getenv("STAND_RETRIES", "2"))                 # повторы GET при таймауте и 5xx
STAND_MAX_RETRY_AFTER = float(os.getenv("STAND_MAX_RETRY_AFTER", "8"))  # дольше ждать 429 на звонке нельзя
DOCTORS_CACHE_TTL = float(os.getenv("DOCTORS_CACHE_TTL", "600"))     # справочник врачей обновляем раз в 10 минут

# Часовой пояс стенда: GMT+4 (все даты в API — в этом поясе)
STAND_TZ_OFFSET_HOURS = 4

# Имя ассистента — используется в приветствии и интерфейсе
ASSISTANT_NAME = "Здравушка"

# ---------- Нейросети (OpenAI-совместимый API) ----------
# Адрес — базовый путь API, обычно заканчивается на /v1, например http://мой-сервер:8000/v1

# Языковая модель (понимание фраз пациента)
# На VM шлюз LLM организаторов уже задан в OPENAI_BASE_URL / OPENAI_API_KEY
LLM_URL = os.getenv("LLM_URL") or os.getenv("OPENAI_BASE_URL", "")
LLM_TOKEN = os.getenv("LLM_TOKEN") or os.getenv("OPENAI_API_KEY", "")
LLM_MODEL = os.getenv("LLM_MODEL", "ai-sage/GigaChat3-10B-A1.8B")
LLM_TIMEOUT = float(os.getenv("LLM_TIMEOUT", "8"))   # дольше пациент ждать не будет — уходим в запасной разбор
# Шлюз нейросетей хакатона принимает не больше 2 одновременных запросов (третий получает 429)
AI_MAX_CONCURRENT = int(os.getenv("AI_MAX_CONCURRENT", "2"))
# Распознавание с уверенностью ниже порога — переспрашиваем на важных шагах (ФИО, подтверждение)
ASR_MIN_CONFIDENCE = float(os.getenv("ASR_MIN_CONFIDENCE", "0.45"))

# Распознавание речи (Whisper)
STT_URL = os.getenv("STT_URL") or os.getenv("OPENAI_BASE_URL", "")
STT_TOKEN = os.getenv("STT_TOKEN") or os.getenv("OPENAI_API_KEY", "")
# whisper-large-v3 — модель с открытыми весами; её запускает шлюз организаторов в российском контуре.
# Префикс «openai/» — только имя модели в каталоге шлюза: аудио в OpenAI не отправляется (см. _trusted ниже).
STT_MODEL = os.getenv("STT_MODEL", "openai/whisper-large-v3")
# Подсказка распознаванию (словарь предметной области). Пусто — без подсказки.
STT_PROMPT = os.getenv("STT_PROMPT", "Звонок в регистратуру поликлиники. Запись к врачу: терапевт, педиатр, "
                       "офтальмолог, отоларинголог, лор, хирург, травматолог, невролог, кардиолог, гинеколог, "
                       "уролог, эндокринолог. Фамилия, имя, отчество, дата рождения: пятнадцатое марта "
                       "тысяча девятьсот восьмидесятого года.")
STT_TIMEOUT = float(os.getenv("STT_TIMEOUT", "15"))

# Синтез речи
TTS_URL = os.getenv("TTS_URL", "")
TTS_TOKEN = os.getenv("TTS_TOKEN", "")
TTS_MODEL = os.getenv("TTS_MODEL", "tts-1")
TTS_VOICE = os.getenv("TTS_VOICE", "")
TTS_TIMEOUT = float(os.getenv("TTS_TIMEOUT", "30"))

# Где синтезировать речь: piper — локально, openai — внешний сервер (TTS_URL)
TTS_BACKEND = os.getenv("TTS_BACKEND", "piper")
# Файл голоса Piper (.onnx, рядом должен лежать .onnx.json)
# Silero (TTS_BACKEND=silero): голоса baya, xenia, kseniya — женские; aidar, eugene — мужские
SILERO_MODEL = os.getenv("SILERO_MODEL", "v4_ru")
SILERO_MODEL_PATH = os.getenv("SILERO_MODEL_PATH", "data/voices/silero_v4_ru.pt")
SILERO_VOICE = os.getenv("SILERO_VOICE", "xenia")
SILERO_RATE = int(os.getenv("SILERO_RATE", "24000"))
# Голос персонажа: SILERO_PITCH = x-low / low / medium / high / x-high; SILERO_SHIFT 1.0 — как есть, 1.18 — «детский»
SILERO_PITCH = os.getenv("SILERO_PITCH", "medium")
SILERO_SHIFT = float(os.getenv("SILERO_SHIFT", "1.0"))
SILERO_THREADS = int(os.getenv("SILERO_THREADS", "2"))
PIPER_MODEL = os.getenv("PIPER_MODEL", "data/voices/ru_RU-irina-medium.onnx")

# ---------- Телефония (Asterisk → AudioSocket) ----------
TELEPHONY_ENABLED = os.getenv("TELEPHONY_ENABLED", "1") == "1"
AUDIOSOCKET_HOST = os.getenv("AUDIOSOCKET_HOST", "127.0.0.1")
AUDIOSOCKET_PORT = int(os.getenv("AUDIOSOCKET_PORT", "9092"))
# Куда звонить с напоминанием. На хакатоне — софтфон команды через шлюз (из ~/SIP.md)
REMINDER_ENDPOINT = os.getenv("REMINDER_ENDPOINT", "PJSIP/phone-049@gateway")
# Детектор речи: громкость, выше которой считаем, что человек говорит (подбирается на живом звонке)
VAD_THRESHOLD = float(os.getenv("VAD_THRESHOLD", "500"))
END_OF_SPEECH_MS = int(os.getenv("END_OF_SPEECH_MS", "800"))   # пауза, после которой фраза закончена
MIN_SPEECH_MS = int(os.getenv("MIN_SPEECH_MS", "250"))         # короче — это шум, а не речь
BARGE_IN_MS = int(os.getenv("BARGE_IN_MS", "400"))             # столько говорит поверх — перебил
SILENCE_PROMPT_SEC = float(os.getenv("SILENCE_PROMPT_SEC", "5"))  # «Вы меня слышите?»
SILENCE_HANGUP_SEC = float(os.getenv("SILENCE_HANGUP_SEC", "5"))  # ещё столько тишины — прощаемся

# ---------- 152-ФЗ: куда можно отправлять речь и текст пациента ----------
# Голос и фразы пациента — персональные данные. Их можно передавать только в доверенный контур:
# шлюз нейросетей хакатона (российский) или сервер внутри сети поликлиники/VM.
# Любой другой адрес STT/LLM/TTS отклоняется при старте — бесплатные облачные сервисы исключены.
TRUSTED_AI_HOSTS = {h.strip() for h in os.getenv(
    "TRUSTED_AI_HOSTS", "hub.gigaschool.ru,localhost,127.0.0.1").split(",") if h.strip()}


# Зарубежные облачные ИИ-сервисы запрещены условиями кейса (152-ФЗ) — даже если их внести в
# TRUSTED_AI_HOSTS по ошибке, адрес будет отклонён. Проверяется по окончанию имени хоста.
FORBIDDEN_AI_DOMAINS = ("openai.com", "anthropic.com", "googleapis.com", "google.com", "azure.com",
                        "microsoft.com", "amazonaws.com", "groq.com", "mistral.ai", "deepgram.com",
                        "assemblyai.com", "elevenlabs.io", "together.xyz", "cohere.ai", "x.ai")


def _forbidden(host: str) -> bool:
    return any(host == d or host.endswith("." + d) for d in FORBIDDEN_AI_DOMAINS)


def _trusted(url: str) -> str:
    """Адрес нейросети разрешён, только если хост в TRUSTED_AI_HOSTS или в частной сети (10.*, 192.168.*)."""
    if not url:
        return ""
    from urllib.parse import urlparse
    import ipaddress
    host = urlparse(url).hostname or ""
    try:
        private = ipaddress.ip_address(host).is_private
    except ValueError:
        private = False
    if not _forbidden(host) and (host in TRUSTED_AI_HOSTS or private):
        return url
    import logging
    logging.getLogger("config").error("152-ФЗ: адрес %s не в доверенном контуре — отключён", host)
    REJECTED_AI_URLS.append(host)
    return ""


REJECTED_AI_URLS: list[str] = []
LLM_URL = _trusted(LLM_URL)
STT_URL = _trusted(STT_URL)
TTS_URL = _trusted(TTS_URL)

# Технический клиент для заявок, когда пациент не успел назваться (экстренный случай, просьба оператора)
TECH_CLIENT = {"last_name": "Срочный", "first_name": "Вызов", "middle_name": "Иванович",
               "birth_date": os.getenv("TECH_CLIENT_BIRTH_DATE", "01.01.1970")}


# Журнал звонков (152-ФЗ): срок хранения и предельный размер, см. app/journal.py
JOURNAL_RETENTION_DAYS = int(os.getenv("JOURNAL_RETENTION_DAYS", "30"))
JOURNAL_MAX_CALLS = int(os.getenv("JOURNAL_MAX_CALLS", "1000"))
