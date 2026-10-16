import asyncio
import queue
import struct
import sys
import uuid

import numpy as np
import sounddevice as sd

KIND_HANGUP, KIND_UUID, KIND_AUDIO = 0x00, 0x01, 0x10
DEVICE_RATE = 16000
BLOCK = 320


async def main(host: str, port: int):
    reader, writer = await asyncio.open_connection(host, port)
    writer.write(struct.pack(">BH", KIND_UUID, 16) + uuid.uuid4().bytes)
    await writer.drain()
    print("Звонок начался. Говорите после приветствия. Ctrl+C — положить трубку.")

    loop = asyncio.get_running_loop()
    mic: asyncio.Queue[bytes] = asyncio.Queue()
    speaker: queue.Queue[bytes] = queue.Queue()
    leftover = bytearray()

    def audio_callback(indata, outdata, frames, time, status):
        pcm16 = np.frombuffer(bytes(indata), dtype=np.int16)
        loop.call_soon_threadsafe(mic.put_nowait, pcm16[::2].tobytes())
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
            await asyncio.sleep(1.0)
    except (asyncio.IncompleteReadError, ConnectionError):
        print("Соединение закрыто.")
    finally:
        sender.cancel()
        try:
            writer.write(struct.pack(">BH", KIND_HANGUP, 0))
            await writer.drain()
            writer.close()
        except Exception:
            pass


if __name__ == "__main__":
    host = sys.argv[1] if len(sys.argv) > 1 else "127.0.0.1"
    port = int(sys.argv[2]) if len(sys.argv) > 2 else 9092
    try:
        asyncio.run(main(host, port))
    except KeyboardInterrupt:
        print("\nТрубка положена.")
