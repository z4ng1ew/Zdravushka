# Мост телефонии: Asterisk ⇄ Здравушка по протоколу AudioSocket.
# Asterisk берёт трубку и шлёт сюда звук пациента по TCP, а мы возвращаем голос Здравушки.
#
#   Звонок (SIP-софтфон) → Asterisk → AudioSocket(TCP :9092) → этот модуль
#        → Whisper (речь → текст) → dialog.handle (мозг) → TTS → звук обратно в трубку
#
# Протокол AudioSocket: пакет = тип (1 байт) + длина (2 байта, big-endian) + данные.
#   0x01 — UUID звонка (16 байт), 0x10 — звук (8 кГц, 16 бит, моно, обычно кадры по 20 мс),
#   0x00 — положили трубку, 0xFF — ошибка.
# Сервер запускается вместе с FastAPI (app/main.py), поэтому звонки сразу видны в кабинете регистратора.
import asyncio
import logging
import shutil
import struct
import time
import uuid

import numpy as np

from app import ai, config, dialog, journal, tts

log = logging.getLogger("telephony")

KIND_HANGUP, KIND_UUID, KIND_AUDIO, KIND_ERROR = 0x00, 0x01, 0x10, 0xFF
RATE = 8000
FRAME_BYTES = 320          # 20 мс звука при 8 кГц, 16 бит
FRAME_SEC = 0.02


def packet(kind: int, payload: bytes = b"") -> bytes:
    return struct.pack(">BH", kind, len(payload)) + payload


def rms(pcm: bytes) -> float:
    """Громкость кадра: по ней понимаем, говорит ли человек."""
    if not pcm:
        return 0.0
    data = np.frombuffer(pcm, dtype=np.int16).astype(np.float32)
    return float(np.sqrt(np.mean(data * data)))


def louder(pcm: bytes, gain: float = 1.8) -> bytes:
    """Громче в gain раз, без хрипа (ограничиваем пики)."""
    data = np.frombuffer(pcm, dtype=np.int16).astype(np.float32) * gain
    return data.clip(-32768, 32767).astype(np.int16).tobytes()


# Исходящие звонки-напоминания: UUID звонка → запись на приём.
# Мы сами выбираем UUID и передаём его Asterisk в команде originate; когда пациент берёт трубку,
# Asterisk открывает AudioSocket с этим UUID — так понимаем, что это напоминание и о какой записи.
OUTBOUND: dict[str, dict] = {}

# ---------- Перезвон после звонка (техчекпоинт 23.10) ----------
# Для проверяющего: эксперты звонят с номеров expert-1…6. Asterisk перед AudioSocket сообщает серверу,
# кто звонит (GET /api/telephony/caller, только с localhost), а после разговора ассистент сам перезванивает:
#   • в разговоре записались / перенесли — звонок-напоминание о записи (С-10: «Вы придёте?»);
#   • записи нет — короткий обратный звонок по обращению, дальше обычный разговор.
# Перезваниваем только номерам из CALLBACK_ALLOWED и только в ответ на звонок (без звонка — никому).
# Тесты: test_callback_after_booking_reminds_about_visit, test_callback_only_for_allowed_numbers.
CALLERS: dict[str, str] = {}   # UUID звонка → номер звонящего (из dialplan)


def register_caller(call_uuid: str, number: str):
    CALLERS[call_uuid] = number


async def callback_plan(session_id: str, number: str) -> tuple[str, dict | None] | None:
    """Кому и о чём перезвонить. None — не перезваниваем."""
    import re
    if not (config.CALLBACK_ENABLED and number and re.match(config.CALLBACK_ALLOWED, number)):
        return None
    # Шлюз присылает номер без дефиса («phone049»), а учётка называется «phone-049» (живой звонок 22.10)
    endpoint = "PJSIP/" + re.sub(r"^([a-z]+)-?(\d+)$", r"\1-\2", number) + "@gateway"
    s = dialog.SESSIONS.get(session_id)
    if s and s.client and dialog.state.stand:
        try:
            visits = await dialog.state.stand.list_visits(client_id=s.client["id"], status="Запланирована")
        except Exception:  # noqa: BLE001 — МИС недоступна: перезвоним без записи
            visits = []
        if visits:
            return endpoint, max(visits, key=lambda v: v["id"])  # самая свежая запись — сделанная в этом звонке
    return endpoint, None


async def callback(session_id: str, number: str):
    """Перезвонить звонившему после разговора."""
    plan = await callback_plan(session_id, number)
    if not plan:
        return
    endpoint, visit = plan
    await asyncio.sleep(config.CALLBACK_DELAY_SEC)  # даём шлюзу освободить линию
    log.info("Перезвон %s (%s)", number, "напоминание" if visit else "обратный звонок")
    await call_reminder(visit, endpoint=endpoint)


FILLER = "Одну секунду, проверяю расписание."  # регламент, раздел 3: при ответе МИС дольше 1,5 с

# Идущие сейчас телефонные звонки (id сессии) — для экрана «Звонок сейчас» в кабинете
ACTIVE: set[str] = set()


class Call:
    """Один телефонный разговор."""

    def __init__(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
        self.reader, self.writer = reader, writer
        self.session_id: str | None = None
        self.speaking = False          # Здравушка сейчас говорит
        self.interrupted = False       # пациент перебил — замолкаем (правило регламента)
        self.closed = False
        self.buffer = bytearray()      # речь пациента, которую копим до паузы
        self.voiced_ms = 0             # сколько миллисекунд в буфере была речь
        self.silence_ms = 0            # сколько миллисекунд тишины подряд
        self.last_voice = time.monotonic()
        self.silence_prompted = False
        self.queue: asyncio.Queue[bytes] = asyncio.Queue()   # готовые фразы пациента
        self.done = False              # мозг завершил разговор
        self.playing = False           # сейчас в трубку идёт голос (иначе шлём тишину)
        self.call_uuid = ""
        self.outbound: dict | None = None  # исходящий звонок-напоминание

    # ---------- Отправка звука в трубку ----------

    async def send(self, kind: int, payload: bytes = b""):
        if self.closed:
            return
        try:
            self.writer.write(packet(kind, payload))
            await self.writer.drain()
        except (ConnectionError, OSError):
            self.closed = True

    async def play(self, pcm: bytes):
        """Проигрываем звук кадрами по 20 мс в реальном темпе. Пациент может перебить."""
        self.playing = True
        try:
            await self._play(pcm)
        finally:
            self.playing = False

    async def _play(self, pcm: bytes):
        start = time.monotonic()
        for i in range(0, len(pcm), FRAME_BYTES):
            if self.closed or self.interrupted:
                return
            frame = pcm[i:i + FRAME_BYTES].ljust(FRAME_BYTES, b"\0")
            await self.send(KIND_AUDIO, frame)
            # держим темп: кадр № n уходит не раньше n × 20 мс от начала
            delay = start + (i // FRAME_BYTES + 1) * FRAME_SEC - time.monotonic()
            if delay > 0:
                await asyncio.sleep(delay)

    async def say(self, text: str):
        """Озвучиваем ответ по предложениям: следующее синтезируется, пока звучит текущее."""
        self.speaking, self.interrupted = True, False
        sentences = tts.split_sentences(text)
        next_audio = asyncio.create_task(tts.speak(sentences[0])) if sentences else None
        for i in range(len(sentences)):
            try:
                wav = await next_audio
            except Exception as e:  # синтез упал — лучше пропустить фразу, чем повесить звонок
                log.warning("TTS: %s", e)
                wav = None
            if i + 1 < len(sentences):
                next_audio = asyncio.create_task(tts.speak(sentences[i + 1]))
            if wav and not self.interrupted:
                pcm = tts.to_pcm(wav, RATE)
                if text.startswith("Повторяю"):  # пациент не расслышал — делаем громче
                    pcm = louder(pcm)
                await self.play(pcm)
            if self.interrupted or self.closed:
                if i + 1 < len(sentences):
                    next_audio.cancel()
                break
        self.speaking = False
        self.last_voice = time.monotonic()

    async def silence_loop(self):
        """Пока Здравушка молчит, шлём «тишину» каждые 20 мс.
        Asterisk ждёт непрерывный поток кадров; без него он пишет «lost frames», а начало фраз может обрезаться."""
        silence = b"\0" * FRAME_BYTES
        tick = time.monotonic()
        while not self.closed:
            if not self.playing:
                await self.send(KIND_AUDIO, silence)
            tick += FRAME_SEC
            delay = tick - time.monotonic()
            if delay > 0:
                await asyncio.sleep(delay)
            else:
                tick = time.monotonic()

    # ---------- Приём звука от пациента ----------

    def on_audio(self, pcm: bytes):
        """Детектор речи: копим фразу, пока человек говорит; пауза → фраза готова."""
        ms = len(pcm) // 16  # 16 байт = 1 мс при 8 кГц, 16 бит
        loud = rms(pcm) > config.VAD_THRESHOLD
        if self.speaking:
            # перебивание: пациент заговорил поверх Здравушки
            if loud:
                self.voiced_ms += ms
                if self.voiced_ms >= config.BARGE_IN_MS:
                    self.interrupted = True
                    self.buffer.clear()
            else:
                self.voiced_ms = 0
            return
        if loud:
            self.buffer += pcm
            self.voiced_ms += ms
            self.silence_ms = 0
            self.last_voice = time.monotonic()
            self.silence_prompted = False
        elif self.buffer:
            self.buffer += pcm
            self.silence_ms += ms
            if self.silence_ms >= self.end_of_speech_ms():
                if self.voiced_ms >= config.MIN_SPEECH_MS:
                    self.queue.put_nowait(bytes(self.buffer))
                self.buffer.clear()
                self.voiced_ms = self.silence_ms = 0

    def end_of_speech_ms(self) -> int:
        """Сколько ждать тишины, чтобы считать фразу законченной. Когда называют ФИО, дату рождения
        или адрес, люди вспоминают и делают паузы — ждём дольше, чтобы не обрывать на полуслове."""
        s = dialog.SESSIONS.get(self.session_id)
        slow = s is not None and s.step in ("identity", "middle_name", "birth_date", "address", "reason")
        if slow:
            return config.END_OF_SPEECH_SLOW_MS
        # Ответ — короткое слово («да», «третий»): долго ждать тишины незачем
        if s is not None and s.step in ("confirm", "confirm_all", "choose_slot", "choose_visit", "remind", "remind_no"):
            return config.END_OF_SPEECH_FAST_MS
        return config.END_OF_SPEECH_MS

    async def reader_loop(self):
        """Читаем пакеты от Asterisk, пока звонок жив."""
        try:
            while not self.closed:
                head = await self.reader.readexactly(3)
                kind, length = struct.unpack(">BH", head)
                payload = await self.reader.readexactly(length) if length else b""
                if kind == KIND_UUID:
                    self.call_uuid = str(uuid.UUID(bytes=payload)) if len(payload) == 16 else ""
                    self.session_id = self.call_uuid.replace("-", "")[:12] or uuid.uuid4().hex[:12]
                elif kind == KIND_AUDIO:
                    self.on_audio(payload)
                elif kind in (KIND_HANGUP, KIND_ERROR):
                    break
        except (asyncio.IncompleteReadError, ConnectionError, OSError):
            pass
        self.closed = True
        self.queue.put_nowait(b"")  # будим основной цикл, чтобы он завершился

    # ---------- Сам разговор ----------

    async def run(self):
        reader_task = asyncio.create_task(self.reader_loop())
        silence_task = asyncio.create_task(self.silence_loop())
        # ждём UUID звонка (Asterisk присылает его первым пакетом)
        for _ in range(100):
            if self.session_id or self.closed:
                break
            await asyncio.sleep(0.02)
        self.session_id = self.session_id or uuid.uuid4().hex[:12]
        ACTIVE.add(self.session_id)
        log.info("Звонок %s", self.session_id)

        self.outbound = OUTBOUND.get(self.call_uuid)
        if self.outbound:  # пациент взял трубку на звонке-напоминании
            self.outbound["answered"].set()
            visit = self.outbound["visit"]
            greeting = (dialog.start_reminder(self.session_id, visit) if visit else dialog.start_followup(
                self.session_id, f"Здравствуйте! Это {config.ASSISTANT_NAME}, виртуальный помощник регистратуры "
                "поликлиники номер семь. Перезваниваю по вашему обращению. Разговор записывается. "
                "Чем ещё могу помочь?"))
        else:
            greeting = await dialog.handle(self.session_id, "")
        await self.say(greeting.reply)

        while not self.closed and not self.done:
            try:
                utterance = await asyncio.wait_for(self.queue.get(), timeout=1.0)
            except asyncio.TimeoutError:
                await self.check_silence()
                continue
            if not utterance:
                break
            await self.process(utterance)

        if not self.closed:
            await asyncio.sleep(0.5)
            await self.send(KIND_HANGUP)
        reader_task.cancel()
        silence_task.cancel()
        try:
            self.writer.close()
        except Exception:  # noqa: BLE001
            pass
        call = journal.CALLS.get(self.session_id)
        if call and call["result"] == "сброшен" and not self.done:
            journal.save()
        ACTIVE.discard(self.session_id)
        if self.outbound:
            self.outbound["finished"].set()
        elif (number := CALLERS.pop(self.call_uuid, "")):  # входящий звонок — перезваниваем
            task = asyncio.create_task(callback(self.session_id, number))
            _CALLBACKS.add(task)
            task.add_done_callback(_CALLBACKS.discard)
        log.info("Звонок %s завершён", self.session_id)

    async def process(self, pcm: bytes):
        """Фраза пациента → текст → мозг → голос."""
        t0 = time.monotonic()
        try:
            text, confidence = await ai.transcribe(tts.pcm_to_wav(pcm, RATE), "phone.wav")
        except ai.AIError as e:
            log.warning("STT: %s", e)
            await self.say("Простите, не расслышала. Повторите, пожалуйста.")
            return
        if not text.strip():
            log.info("Фраза отброшена как шум (пусто после распознавания)")
            return
        t1 = time.monotonic()
        try:
            # Регламент (раздел 3): «Одну секунду, проверяю расписание» — если МИС отвечает дольше 1,5 с.
            # Пациент не сидит в тишине, пока идёт поиск.
            work = asyncio.create_task(dialog.handle(self.session_id, text, confidence))
            done, _ = await asyncio.wait({work}, timeout=config.FILLER_AFTER_SEC)
            s = dialog.SESSIONS.get(self.session_id)
            mis_step = s is not None and (s.client or s.fields.get("birth_date"))  # пациент назван — идёт поиск в МИС
            if not done and mis_step:
                call = journal.CALLS.get(self.session_id)
                if call is not None:
                    journal.say(call, "bot", FILLER)
                await self.say(FILLER)
            answer = await work
        except Exception:  # непредвиденная ошибка логики не должна оставлять пациента в тишине
            log.exception("Ошибка диалога в звонке %s", self.session_id)
            await self.say("Извините, произошёл сбой. Соединяю с регистратором.")
            self.done = True
            return
        t2 = time.monotonic()
        # Замер по этапам (техчекпоинт 23.10): видно, кто тормозит — распознавание, диалог (LLM + МИС) или синтез
        timing = {"stt_ms": int((t1 - t0) * 1000), "dialog_ms": int((t2 - t1) * 1000),
                  "stt": ai.LAST.get("stt", {}).get("provider"), "llm": ai.LAST.get("llm", {}).get("provider")}
        call = journal.CALLS.get(self.session_id)
        if call is not None:
            call.setdefault("timings", []).append(timing)
        log.info("Фраза: распознавание %s мс, диалог %s мс", timing["stt_ms"], timing["dialog_ms"])
        await self.say(answer.reply)
        if answer.done:
            self.done = True

    async def check_silence(self):
        """Регламент: 5 секунд тишины — «Вы меня слышите?», ещё 5 — прощаемся."""
        if self.speaking or self.buffer:
            return
        quiet = time.monotonic() - self.last_voice
        call = journal.CALLS.get(self.session_id)
        if quiet >= config.SILENCE_HANGUP_SEC and self.silence_prompted:
            if call is not None:  # видно в журнале, почему звонок закончился
                journal.say(call, "bot", "Вас не слышно. Перезвоните, пожалуйста.")
                call["result"] = "тишина — завершён"
            await self.say("Вас не слышно. Перезвоните, пожалуйста.")
            self.done = True
        elif quiet >= config.SILENCE_PROMPT_SEC and not self.silence_prompted:
            self.silence_prompted = True
            # Посреди сценария — напоминаем вопрос: после длинного перечня вариантов пациент мог растеряться
            text = "Вы меня слышите?"  # дословно по регламенту (раздел 3, «Тишина»)
            if call is not None:
                journal.say(call, "bot", text)
            await self.say(text)


# ---------- Исходящие звонки (напоминания) ----------

async def _asterisk(command: str) -> tuple[int, str]:
    """Команда в консоль Asterisk. Нужны права: группа asterisk или sudo без пароля."""
    base = ["asterisk", "-rx", command]
    for cmd in (base, ["sudo", "-n"] + base):
        if not shutil.which(cmd[0]):
            continue
        proc = await asyncio.create_subprocess_exec(*cmd, stdout=asyncio.subprocess.PIPE,
                                                    stderr=asyncio.subprocess.STDOUT)
        out, _ = await proc.communicate()
        text = out.decode(errors="ignore")
        if proc.returncode == 0 and "Unable to connect" not in text and "ermission" not in text:
            return 0, text
    return 1, text if "text" in locals() else "asterisk не найден"


_CALLBACKS: set = set()


async def call_reminder(visit: dict | None, ring_sec: int = 60, endpoint: str | None = None) -> str:
    """Звоним пациенту и ждём конца разговора. Возвращает итог для журнала напоминаний."""
    call_uuid = str(uuid.uuid4())
    entry = {"visit": visit, "answered": asyncio.Event(), "finished": asyncio.Event()}
    OUTBOUND[call_uuid] = entry
    try:
        code, out = await _asterisk(
            f"channel originate {endpoint or config.REMINDER_ENDPOINT} application AudioSocket "
            f"{call_uuid},{config.AUDIOSOCKET_HOST}:{config.AUDIOSOCKET_PORT}")
        if code:
            log.warning("originate: %s", out.strip())
            return "ошибка звонка"
        try:
            await asyncio.wait_for(entry["answered"].wait(), ring_sec)
        except asyncio.TimeoutError:
            return "не дозвонились"
        await asyncio.wait_for(entry["finished"].wait(), 600)
        return "звонок завершён"
    except asyncio.TimeoutError:
        return "звонок завершён"
    finally:
        OUTBOUND.pop(call_uuid, None)


async def _on_connect(reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
    try:
        await Call(reader, writer).run()
    except Exception:  # один упавший звонок не должен ронять сервер
        log.exception("Ошибка в звонке")


async def start_server() -> asyncio.base_events.Server:
    server = await asyncio.start_server(_on_connect, config.AUDIOSOCKET_HOST, config.AUDIOSOCKET_PORT)
    log.info("AudioSocket слушает %s:%s", config.AUDIOSOCKET_HOST, config.AUDIOSOCKET_PORT)
    return server
