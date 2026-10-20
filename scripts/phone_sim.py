# Имитатор телефона: ваш микрофон и динамики вместо Asterisk.
# Говорит с мостом Здравушки (app/telephony.py) по тому же протоколу AudioSocket, что и Asterisk,
# поэтому проверяет всю цепочку звонка: детектор речи → Whisper → мозг → синтез → звук.
#
# Установка:  pip install sounddevice numpy      (на Linux ещё нужен portaudio: sudo dnf install portaudio)
# Запуск:     python -m scripts.phone_sim                  (сервер Здравушки должен быть запущен)
#             python -m scripts.phone_sim 192.168.1.10 9092   (если мост на другой машине)
# Говорите В НАУШНИКАХ: иначе микрофон слышит Здравушку из динамиков и она «перебивает сама себя».
# Завершить звонок — Ctrl+C.
import asyncio
import queue
import struct
import sys
import uuid

import numpy as np
import sounddevice as sd

KIND_HANGUP, KIND_UUID, KIND_AUDIO = 0x00, 0x01, 0x10
DEVICE_RATE = 16000          # большинство звуковых карт умеют 16 кГц; телефонные 8 кГц получаем сами
BLOCK = 320                  # 20 мс при 16 кГц


async def main(host: str, port: int):
    reader, writer = await asyncio.open_connection(host, port)
    writer.write(struct.pack(">BH", KIND_UUID, 16) + uuid.uuid4().bytes)  # «звонок начался»
    await writer.drain()
    print("Звонок начался. Говорите после приветствия. Ctrl+C — положить трубку.")

    loop = asyncio.get_running_loop()
    mic: asyncio.Queue[bytes] = asyncio.Queue()
    speaker: queue.Queue[bytes] = queue.Queue()
    leftover = bytearray()

    def audio_callback(indata, outdata, frames, time, status):
        # микрофон: 16 кГц → 8 кГц (берём каждый второй отсчёт)
        pcm16 = np.frombuffer(bytes(indata), dtype=np.int16)
        loop.call_soon_threadsafe(mic.put_nowait, pcm16[::2].tobytes())
        # динамик: берём из очереди столько, сколько нужно звуковой карте
        need = frames * 2
        while len(leftover) < need:
            try:
                leftover.extend(speaker.get_nowait())
            except queue.Empty:
                break
        chunk = bytes(leftover[:need]).ljust(need, b"\0")
        del leftover[:need]
        outdata[:] = chunk

    async def send_mic():
        while True:
            pcm8 = await mic.get()
            writer.write(struct.pack(">BH", KIND_AUDIO, len(pcm8)) + pcm8)
            await writer.drain()

    async def receive():
        while True:
            head = await reader.readexactly(3)
            kind, length = struct.unpack(">BH", head)
            payload = await reader.readexactly(length) if length else b""
            if kind == KIND_AUDIO:
                # голос Здравушки: 8 кГц → 16 кГц (повторяем каждый отсчёт)
                pcm8 = np.frombuffer(payload, dtype=np.int16)
                speaker.put(np.repeat(pcm8, 2).tobytes())
            elif kind == KIND_HANGUP:
                print("Здравушка положила трубку.")
                return

    stream = sd.RawStream(samplerate=DEVICE_RATE, blocksize=BLOCK, channels=1, dtype="int16",
                          callback=audio_callback)
    sender = asyncio.create_task(send_mic())
    try:
        with stream:
            await receive()
            await asyncio.sleep(1.0)  # дать доиграть последнюю фразу
    except (asyncio.IncompleteReadError, ConnectionError):
        print("Соединение закрыто.")
    finally:
        sender.cancel()
        try:
            writer.write(struct.pack(">BH", KIND_HANGUP, 0))
            await writer.drain()
            writer.close()
        except Exception:  # noqa: BLE001 — соединение уже могло закрыться
            pass


if __name__ == "__main__":
    host = sys.argv[1] if len(sys.argv) > 1 else "127.0.0.1"
    port = int(sys.argv[2]) if len(sys.argv) > 2 else 9092
    try:
        asyncio.run(main(host, port))
    except KeyboardInterrupt:
        print("\nТрубка положена.")
