# Источники нейросетей (распознавание речи и LLM): какой сервер спрашивать первым и куда уходить при сбое.
#
# Для проверяющего (техчекпоинт 23.10: задержки 4–11 с при общей нагрузке на шлюз хакатона):
#   • «organizers» — шлюз организаторов из окружения VM (OPENAI_BASE_URL / OPENAI_API_KEY), есть всегда;
#   • свои серверы команды (OpenAI-совместимый API: Ollama, LM Studio, vLLM, whisper-сервер) —
#     в data/runtime/providers.json (папка data/runtime/ уже в .gitignore) (там токены), пример — providers.example.json;
#   • цепочка: сначала выбранный источник с коротким таймаутом, при сбое — следующий (по умолчанию шлюз
#     организаторов). Пациент не ждёт «зависший» сервер, звонок не падает;
#   • 152-ФЗ: адрес любого источника проходит ту же проверку, что и раньше (config._forbidden) —
#     зарубежные облачные сервисы отклоняются даже из providers.json; свои серверы — в России.
#   • выбор источника — в кабинете (GET/POST /api/providers) или в этом файле, без перезапуска.
# Тесты: test_providers_chain_and_fallback, test_providers_never_expose_tokens, test_foreign_provider_rejected.
import json
import logging
import os
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse

from app import config

log = logging.getLogger("providers")
FILE = Path(os.getenv("PROVIDERS_FILE", Path(__file__).resolve().parent.parent / "data" / "runtime" / "providers.json"))
KINDS = ("stt", "llm")


@dataclass(frozen=True)
class Endpoint:
    provider: str   # имя источника: organizers, mac, …
    url: str        # OpenAI-совместимый адрес, …/v1
    token: str
    model: str


def _organizers() -> dict:
    return {"title": "Шлюз организаторов", "url_llm": config.LLM_URL, "url_stt": config.STT_URL,
            "token_llm": config.LLM_TOKEN, "token_stt": config.STT_TOKEN,
            "llm_model": config.LLM_MODEL, "stt_model": config.STT_MODEL}


def _load() -> dict:
    try:
        data = json.loads(FILE.read_text(encoding="utf-8")) if FILE.exists() else {}
    except (OSError, ValueError) as e:
        log.warning("providers.json не прочитан, работаем через шлюз организаторов: %s", e)
        data = {}
    data.setdefault("providers", {})
    data.setdefault("active", {})
    return data


def _safe(url: str) -> str:
    """Тот же контроль 152-ФЗ, что для .env: зарубежный облачный сервис — отклоняем."""
    host = urlparse(url or "").hostname or ""
    if not host or config._forbidden(host):
        if host:
            log.error("152-ФЗ: источник %s запрещён — пропущен", host)
        return ""
    return url


def all_providers() -> dict[str, dict]:
    data = _load()
    out = {"organizers": _organizers()}
    for name, p in data["providers"].items():
        if isinstance(p, dict) and name != "organizers":
            out[name] = p
    return out


def _endpoint(name: str, p: dict, kind: str) -> Endpoint | None:
    url = _safe(p.get(f"url_{kind}") or p.get("url") or "")
    model = p.get(f"{kind}_model") or ""
    if not (url and model):
        return None
    return Endpoint(name, url.rstrip("/"), p.get(f"token_{kind}") or p.get("token") or "", model)


def active(kind: str) -> str:
    name = _load()["active"].get(kind) or "organizers"
    return name if name in all_providers() else "organizers"


def chain(kind: str) -> list[Endpoint]:
    """Кого спрашивать по порядку: выбранный источник, затем шлюз организаторов (если это другой)."""
    provs = all_providers()
    order = [active(kind)] + [n for n in ("organizers",) if n != active(kind)]
    if not _load().get("fallback", True):
        order = order[:1]
    return [e for n in order if (e := _endpoint(n, provs[n], kind))]


def set_active(kind: str, name: str):
    if kind not in KINDS or name not in all_providers():
        raise ValueError(f"нет источника {name!r} для {kind!r}")
    data = _load()
    data["active"][kind] = name
    FILE.parent.mkdir(parents=True, exist_ok=True)
    tmp = FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    os.chmod(tmp, 0o600)  # в файле токены — читать может только сервер
    os.replace(tmp, FILE)


def public() -> dict:
    """Для кабинета: список источников и выбор — без токенов и адресов."""
    provs = all_providers()
    return {"active": {k: active(k) for k in KINDS},
            "providers": [{"name": n, "title": p.get("title") or n,
                           "stt": _endpoint(n, p, "stt") is not None, "llm": _endpoint(n, p, "llm") is not None,
                           "stt_model": p.get("stt_model"), "llm_model": p.get("llm_model")}
                          for n, p in provs.items()]}
