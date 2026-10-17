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
            if self.silence_ms >= config.END_OF_SPEECH_MS:
                if self.voiced_ms >= config.MIN_SPEECH_MS:
                    self.queue.put_nowait(bytes(self.buffer))
                self.buffer.clear()
                self.voiced_ms = self.silence_ms = 0

    async def reader_loop(self):
        """Читаем пакеты от Asterisk, пока звонок жив."""
        try:
            while not self.closed:
                head = await self.reader.readexactly(3)
                kind, length = struct.unpack(">BH", head)
                payload = await self.reader.readexactly(length) if length else b""
                if kind == KIND_UUID:
                    self.session_id = uuid.UUID(bytes=payload).hex[:12] if len(payload) == 16 else uuid.uuid4().hex[:12]
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
        log.info("Звонок %s", self.session_id)

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
        log.info("Звонок %s завершён", self.session_id)

    async def process(self, pcm: bytes):
        """Фраза пациента → текст → мозг → голос."""
        try:
            text = await ai.speech_to_text(tts.pcm_to_wav(pcm, RATE), "phone.wav")
        except ai.AIError as e:
            log.warning("STT: %s", e)
            await self.say("Простите, не расслышала. Повторите, пожалуйста.")
            return
        if not text.strip():
            return
        if self.session_id in journal.CALLS:
            journal.CALLS[self.session_id]["direction"] = "входящий"
        answer = await dialog.handle(self.session_id, text)
        await self.say(answer.reply)
        if answer.done:
            self.done = True

    async def check_silence(self):
        """Регламент: 5 секунд тишины — «Вы меня слышите?», ещё 5 — прощаемся."""
        if self.speaking or self.buffer:
            return
        quiet = time.monotonic() - self.last_voice
        if quiet >= config.SILENCE_HANGUP_SEC and self.silence_prompted:
            await self.say("Вас не слышно. Перезвоните, пожалуйста.")
            self.done = True
        elif quiet >= config.SILENCE_PROMPT_SEC and not self.silence_prompted:
            self.silence_prompted = True
            await self.say("Вы меня слышите?")


async def _on_connect(reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
    try:
        await Call(reader, writer).run()
    except Exception:  # один упавший звонок не должен ронять сервер
        log.exception("Ошибка в звонке")


async def start_server() -> asyncio.base_events.Server:
    server = await asyncio.start_server(_on_connect, config.AUDIOSOCKET_HOST, config.AUDIOSOCKET_PORT)
    log.info("AudioSocket слушает %s:%s", config.AUDIOSOCKET_HOST, config.AUDIOSOCKET_PORT)
    return server
