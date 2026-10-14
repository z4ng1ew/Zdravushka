
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