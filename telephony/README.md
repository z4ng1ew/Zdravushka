# Телефония Здравушки: Asterisk + SIP-софтфон

Схема: софтфон → SIP → Asterisk (номер 100) → AudioSocket (TCP 9092) → сервер Здравушки → голос обратно.
Мост на стороне Здравушки (`app/telephony.py`) запускается вместе с сервером: `uvicorn app.main:app --port 8000`.
Проверка: `http://localhost:8000/api/health` → поле `"telephony": "127.0.0.1:9092"`.

## 1. Установка Asterisk (Ubuntu/Debian)
```bash
sudo apt install asterisk
sudo asterisk -rx "module show like audiosocket"   # должны быть app_audiosocket и res_audiosocket
```
Если модулей нет — нужна сборка Asterisk 20+ из исходников или docker-образ с ними.

## 2. Конфиги
```bash
sudo cp telephony/asterisk/pjsip.conf /etc/asterisk/pjsip.conf
sudo cp telephony/asterisk/extensions.conf /etc/asterisk/extensions.conf
sudo nano /etc/asterisk/pjsip.conf        # поменять CHANGE_ME на свой пароль
sudo asterisk -rx "core reload"
```

## 3. Софтфон
Linphone или Zoiper на телефоне/ноутбуке: пользователь `patient`, пароль из pjsip.conf,
домен — IP машины с Asterisk, транспорт UDP. Звонить на `100`.

## 4. Порты
UDP 5060 (SIP) и UDP 10000–20000 (голос) — открыты до машины с Asterisk.
TCP 9092 — только между Asterisk и сервером Здравушки (наружу не открывать).

## 5. Отладка
```bash
sudo asterisk -rvvv          # консоль Asterisk: видно звонок и вызов AudioSocket
```
- Здравушка не слышит пациента → подберите VAD_THRESHOLD в .env (тише микрофон — меньше число, например 300).
- Обрывает фразы на полуслове → увеличьте END_OF_SPEECH_MS (например 1000).
- Если `${UUID()}` не поддерживается вашей версией → замените на `${SHELL(uuidgen | tr -d '\n')}`.
