# Мозг Здравушки: ведёт разговор по сценариям регламента и выполняет действия в МИС.
# Нейросеть только ПОНИМАЕТ фразу (app/nlu.py). Все решения — врач, время, запись,
# перевод на человека — принимает этот код. Поэтому записи не бывают «выдуманными».
#
# Устройство пакета (каждый модуль зависит только от тех, что выше него):
#   session.py       — типизированное состояние одного разговора (Session)
#   state.py         — подключение к МИС через порт MisPort (стенд или STAND_MODE=mock) и сессии
#   mis.py           — все операции с МИС; любой сбой → StandDown → перевод на регистратора (R-06)
#   common.py        — ответы, завершение задачи, перевод на сотрудника с заявкой в МИС
#   steps.py         — общие шаги: узнать пациента, подобрать время, выбрать вариант
#   booking.py       — С-01 запись на приём
#   visits.py        — С-03 перенос, С-04 отмена, С-05 статус записи
#   info.py          — С-07 график врача, справка по регламенту, С-06 вызов врача на дом
#   reminder.py      — С-10 звонок-напоминание
#   guards.py        — проверки до нейросети (красные флаги, «повторите», «какие врачи»)
#   understanding.py — понимание фразы с учётом текущего вопроса
#   interceptors.py  — намерения, прерывающие сценарий (103, оператор, жалоба, медвопрос, прощание)
#   router.py        — handle(): только порядок шагов
from app import journal
from app.dialog import state
from app.dialog.common import GREETING
from app.dialog.reminder import start_reminder
from app.dialog.router import handle
from app.dialog.state import SESSIONS

__all__ = ["GREETING", "SESSIONS", "handle", "journal", "start_reminder", "state"]
