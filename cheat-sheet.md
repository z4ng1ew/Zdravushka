
## ЗАПУСК

uvicorn app.main:app --reload --port 8000


uvicorn app.main:app --reload --reload-dir app --port 8000



## Установка requirements.txt


pip install -r requirements.txt






## Проверки

проверка scripts.check_stand

 python -m scripts.check_stand
Нет токена: впишите STAND_TOKEN в файл .env



проверка schedule.py:


python -c "
from app import schedule as s
docs=[{'id':1,'full_name':'Смирнова Е.В.','specialty':'Терапевт','is_active':True},
      {'id':2,'full_name':'Иванов П.С.','specialty':'Терапевт','is_active':True}]
for doc, t in s.find_free_slots(docs, set(), part_of_day='утро'):
    print(doc['full_name'], s.to_api(t), '->', s.say_slot(t))
"










## Запуск и проверка (у меня локально)

uvicorn app.main:app --reload --port 8000



# scripts/build_schedule.py — Excel → JSON 

Превращает Excel с расписанием от организаторов в data/schedule.json,  который быстро читает сервер. Запускать после каждого обновления Excel:


 python -m scripts.build_schedule data/raw/schedule.xlsx



 # Excel тяжёлый (137 тысяч строк), поэтому читаем его один раз здесь, а не при каждом звонке.



 # Проверка трёх нейросетей. Запуск из корня проекта: 
 
 python -m scripts.check_models











pip install -r requirements.txt




# голос Здравушки для Piper (≈63 МБ, в git не кладём)
mkdir -p data/voices

wget -O data/voices/ru_RU-irina-medium.onnx https://huggingface.co/rhasspy/piper-voices/resolve/main/ru/ru_RU/irina/medium/ru_RU-irina-medium.onnx


wget -O data/voices/ru_RU-irina-medium.onnx.json https://huggingface.co/rhasspy/piper-voices/resolve/main/ru/ru_RU/irina/medium/ru_RU-irina-medium.onnx.json






# 1. Отдельное окружение (PyTorch тяжёлый, лучше не смешивать с проектом):

source .venv-silero/bin/activate




# Обычное окружение
source .venv/bin/activate




## Проверка определения видеокарты:

После запуска должно появиться Silero загружена: v5_ru и Устройство: cuda. Если вместо cuda написано cpu, видеокарта не нашлась. Проверить можно так: python -c "import torch; print(torch.cuda.is_available())".














# Три терминала:

Silero: source .venv-silero/bin/activate && python scripts/silero_server.py
Здравушка: source .venv/bin/activate && uvicorn app.main:app --reload --reload-dir app --port 8000
Телефон (в наушниках):













# Проверить связь со стендом (должно показать ~85 врачей): (на виртуалке)

source .venv/bin/activate

python -m scripts.check_stand





# 1. Сервер, который не умирает (сделать прямо сейчас)

# в окне с run.sh нажми Ctrl+C, затем:
tmux new -s server            # если "command not found": sudo apt install -y tmux
./run.sh
# Ctrl+B, отпусти, потом D — сервер остаётся работать





# как на виртуалке скачать изменения

git fetch origin
git reset --hard origin/main




# Тесты:
python -m pytest -q tests





# Как пушить на гитея с локалки на федоре

python -m pytest -q tests/        # 29 passed
git add . && git commit -m "Звонки-напоминания: подтверждение, отмена, перенос через Asterisk" && git push gitea master:main























# перезапуск виртуалки после внесения изменений в репо и на виртуалку

cd ~/project && git pull && tmux kill-session -t server; tmux new -d -s server ./run.sh


**ещё один способ**

cd ~/project
tmux kill-session -t server; tmux new -d -s server "./run.sh 2>&1 | tee -a server.log"
sleep 5 && curl -s 127.0.0.1:8000/api/health





**новая версия**

cd ~/project && git pull
tmux kill-server
tmux new -d -s server "./run.sh 2>&1 | tee -a server.log"



Здесь именно tmux kill-server, а не kill-session. Новая группа asterisk, которую ты добавил, применяется только к процессам, запущенным заново. Если что-то не так с правами, Здравушка сама попробует sudo -n (у тебя sudo работает без пароля).






**последняя версия**

cd ~/project && git pull
tmux kill-server
tmux new -d -s server "./run.sh 2>&1 | tee -a server.log"





**стабильная версия**

cd ~/project
tmux new -d -s server "./run.sh 2>&1 | tee -a server.log"
sleep 5 && curl -s 127.0.0.1:8000/api/health





**На VM:**

cd ~/project && git pull
tmux kill-server; sleep 2; tmux new -d -s server "./run.sh 2>&1 | tee -a server.log"
sleep 5 && curl -s 127.0.0.1:8000/api/health






















# логи при звонке, проверке :

логи сервера:

 tail -f server.log


логи телефонии:

sudo asterisk -rvvv  







# визит ай ди :

1. <visit_id> нужно было заменить на настоящий номер записи, угловые скобки bash понял как перенаправление. Делай так:

bash
curl -s 127.0.0.1:8000/api/reminders

2. В ответе будут строки вида {"visit_id": 123, "patient": ..., "scheduled_at": "19.10.2026 09:00", "status": "ожидает"}. Возьми число из visit_id и подставь без скобок:

bash
curl -s -X POST 127.0.0.1:8000/api/reminders/123/call

3. Linphone должен зазвонить, а Linphone при этом должен быть открыт с зелёной точкой. Возьми трубку и ответь «да», «перенесите» или «отмените».

4. Если не зазвонит, пришли:

bash
grep -iE "originate|reminder|Ошибка" server.log | tail -20






















# на VM  новые команды с генерацией СТАТИК
cd ~/project && git pull
./scripts/build_frontend.sh          # первый раз 2–4 минуты
tmux kill-server; sleep 2; tmux new -d -s server "./run.sh 2>&1 | tee -a server.log"
sleep 5 && curl -s 127.0.0.1:8000/api/health














# на vm

cd ~/project
git checkout -- static          # вернуть static к версии из git, чтобы pull прошёл
git pull                        # теперь пройдёт и удалит static из-под git
./scripts/build_frontend.sh     # пересобрать (быстрее, node_modules уже есть)
tmux kill-server; sleep 2; tmux new -d -s server "./run.sh 2>&1 | tee -a server.log"
sleep 5 && curl -s 127.0.0.1:8000/api/health
git status                      # должно быть "nothing to commit, working tree clean"







**На VM (не в 06:00–10:00):**

   cd ~/project && git pull && ./scripts/build_frontend.sh
   tmux kill-server; sleep 2; tmux new -d -s server "./run.sh 2>&1 | tee -a server.log"
   sleep 5 && curl -s 127.0.0.1:8000/api/health
   ./scripts/lock_requirements.sh && git add requirements.lock && git commit -m "Закреплены версии" && git push origin main










# ТЕСТЫ ДЛЯ ФРОНТА

 cd frontend && npm ci && npm run check



**Сейчас ты в ~/Zdravushka/frontend  :**


npm ci
npm run check          # ожидается 209 passed
cd ..                  # вернуться в ~/Zdravushka











# при конфликте

cd ~/Zdravushka
git pull --rebase gitea main
git push gitea master:main





# для иметации звонка напоминания:

Здесь две отдельные проблемы.



**Шаг 1. Запись на завтра одной командой** (разговор через API, как на сайте):
```bash
cd ~/project && source .venv/bin/activate
python - <<'EOF'
import httpx
c = httpx.Client(base_url="http://127.0.0.1:8000", timeout=60)
r = c.post("/api/chat", json={"text": ""}).json(); sid = r["session_id"]
for phrase in ["Запишите меня к терапевту на завтра",
               "Тестов Тест Тестович, первое января тысяча девятьсот девяностого года",
               "первый", "да"]:
    r = c.post("/api/chat", json={"session_id": sid, "text": phrase}).json()
    print(">", phrase, "\n<", r["reply"], "\n")
print("НОМЕР ЗАПИСИ:", (r.get("booking") or {}).get("visit_id"))
EOF
```
В конце будет `НОМЕР ЗАПИСИ: …`, например 501.

**Шаг 2. Проверь, что запись видна для обзвона:**
```bash
curl -s 127.0.0.1:8000/api/reminders
```
В списке должна быть строка с `"visit_id": 501` и `"status": "ожидает"`.

**Шаг 3. Звонок.** Команду набери **ровно так**, подставив свой номер. В прошлые разы на конце было `callll` вместо `call`, поэтому и приходило «Запись не найдена»:
```bash
curl -s -X POST 127.0.0.1:8000/api/reminders/501/call
```
Ответ `{"queued":1}` означает, что Linphone сейчас зазвонит. Возьми трубку и ответь «да», «перенесите» или «отмените».

Вместо шага 3 можно открыть кабинет `/staff/`: блок «Исходящий обзвон» → кнопка **«Позвонить»** у этой записи.

**Если не зазвонил:**
- `grep -iE "originate|reminder" server.log | tail` — что ответил Asterisk;
- `sudo asterisk -rx "pjsip show registrations"` — должно быть `Registered`;
- окно `sudo asterisk -rvvv` во время звонка — там видно, дошёл ли вызов до `phone-049`.

Перед тестом убедись, что на VM запущена свежая версия: `git pull` и перезапуск tmux после push из пункта 1.