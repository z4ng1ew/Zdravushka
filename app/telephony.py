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
FRAME_BYTES = 320
FRAME_SEC = 0.02


def packet(kind: int, payload: bytes = b"") -> bytes:
    return struct.pack(">BH", kind, len(payload)) + payload


def rms(pcm: bytes) -> float:
    if not pcm:
        return 0.0
    data = np.frombuffer(pcm, dtype=np.int16).astype(np.float32)
    return float(np.sqrt(np.mean(data * data)))


def louder(pcm: bytes, gain: float = 1.8) -> bytes:
    data = np.frombuffer(pcm, dtype=np.int16).astype(np.float32) * gain
    return data.clip(-32768, 32767).astype(np.int16).tobytes()


OUTBOUND: dict[str, dict] = {}

ACTIVE: set[str] = set()


class Call:

    def __init__(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
        self.reader, self.writer = reader, writer
        self.session_id: str | None = None
        self.speaking = False
        self.interrupted = False
        self.closed = False
        self.buffer = bytearray()
        self.voiced_ms = 0
        self.silence_ms = 0
        self.last_voice = time.monotonic()
        self.silence_prompted = False
        self.queue: asyncio.Queue[bytes] = asyncio.Queue()
        self.done = False
        self.playing = False
        self.call_uuid = ""
        self.outbound: dict | None = None


    async def send(self, kind: int, payload: bytes = b""):
        if self.closed:
            return
        try:
            self.writer.write(packet(kind, payload))
            await self.writer.drain()
        except (ConnectionError, OSError):
            self.closed = True

    async def play(self, pcm: bytes):
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
            delay = start + (i // FRAME_BYTES + 1) * FRAME_SEC - time.monotonic()
            if delay > 0:
                await asyncio.sleep(delay)

    async def say(self, text: str):
        self.speaking, self.interrupted = True, False
        sentences = tts.split_sentences(text)
        next_audio = asyncio.create_task(tts.speak(sentences[0])) if sentences else None
        for i in range(len(sentences)):
            try:
                wav = await next_audio
            except Exception as e:
                log.warning("TTS: %s", e)
                wav = None
            if i + 1 < len(sentences):
                next_audio = asyncio.create_task(tts.speak(sentences[i + 1]))
            if wav and not self.interrupted:
                pcm = tts.to_pcm(wav, RATE)
                if text.startswith("Повторяю"):
                    pcm = louder(pcm)
                await self.play(pcm)
            if self.interrupted or self.closed:
                if i + 1 < len(sentences):
                    next_audio.cancel()
                break
        self.speaking = False
        self.last_voice = time.monotonic()

    async def silence_loop(self):
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


    def on_audio(self, pcm: bytes):
        ms = len(pcm) // 16
        loud = rms(pcm) > config.VAD_THRESHOLD
        if self.speaking:
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
        self.queue.put_nowait(b"")


    async def run(self):
        reader_task = asyncio.create_task(self.reader_loop())
        silence_task = asyncio.create_task(self.silence_loop())
        for _ in range(100):
            if self.session_id or self.closed:
                break
            await asyncio.sleep(0.02)
        self.session_id = self.session_id or uuid.uuid4().hex[:12]
        ACTIVE.add(self.session_id)
        log.info("Звонок %s", self.session_id)

        self.outbound = OUTBOUND.get(self.call_uuid)
        if self.outbound:
            self.outbound["answered"].set()
            greeting = dialog.start_reminder(self.session_id, self.outbound["visit"])
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
        except Exception:
            pass
        call = journal.CALLS.get(self.session_id)
        if call and call["result"] == "сброшен" and not self.done:
            journal.save()
        ACTIVE.discard(self.session_id)
        if self.outbound:
            self.outbound["finished"].set()
        log.info("Звонок %s завершён", self.session_id)

    async def process(self, pcm: bytes):
        try:
            text = await ai.speech_to_text(tts.pcm_to_wav(pcm, RATE), "phone.wav")
        except ai.AIError as e:
            log.warning("STT: %s", e)
            await self.say("Простите, не расслышала. Повторите, пожалуйста.")
            return
        if not text.strip():
            return
        try:
            answer = await dialog.handle(self.session_id, text)
        except Exception:
            log.exception("Ошибка диалога в звонке %s", self.session_id)
            await self.say("Извините, произошёл сбой. Соединяю с регистратором.")
            self.done = True
            return
        await self.say(answer.reply)
        if answer.done:
            self.done = True

    async def check_silence(self):
        if self.speaking or self.buffer:
            return
        quiet = time.monotonic() - self.last_voice
        if quiet >= config.SILENCE_HANGUP_SEC and self.silence_prompted:
            await self.say("Вас не слышно. Перезвоните, пожалуйста.")
            self.done = True
        elif quiet >= config.SILENCE_PROMPT_SEC and not self.silence_prompted:
            self.silence_prompted = True
            await self.say("Вы меня слышите?")


async def _asterisk(command: str) -> tuple[int, str]:
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


async def call_reminder(visit: dict, ring_sec: int = 60) -> str:
    call_uuid = str(uuid.uuid4())
    entry = {"visit": visit, "answered": asyncio.Event(), "finished": asyncio.Event()}
    OUTBOUND[call_uuid] = entry
    try:
        code, out = await _asterisk(
            f"channel originate {config.REMINDER_ENDPOINT} application AudioSocket "
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
    except Exception:
        log.exception("Ошибка в звонке")


async def start_server() -> asyncio.base_events.Server:
    server = await asyncio.start_server(_on_connect, config.AUDIOSOCKET_HOST, config.AUDIOSOCKET_PORT)
    log.info("AudioSocket слушает %s:%s", config.AUDIOSOCKET_HOST, config.AUDIOSOCKET_PORT)
    return server
