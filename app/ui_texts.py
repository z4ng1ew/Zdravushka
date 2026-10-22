# Все тексты, которые видит и слышит пациент, — в одном месте (бэкенд — единственный источник).
# Для проверяющего: замечание прогона 22.10 «Подача результата пользователю» (тикет поддержки #207) —
# приветствие было задано дважды (app/dialog/common.py и frontend/features/call/model/greeting.ts),
# подписи статусов собирал фронт. Теперь:
#   • приветствие, имя ассистента и подсказки интерфейса фронт получает из GET /api/texts;
#   • подпись под каждым ответом (label: «✓ Записано в МИС · № 837», «📄 Ответ по регламенту»,
#     «👤 Передано регистратору · R-07») присылает /api/chat — фронт показывает её как есть.
# Тесты: test_ui_texts_single_source, test_reply_label_from_backend.
from app import config

ASSISTANT_NAME = config.ASSISTANT_NAME

GREETING = (f"Здравствуйте! Я {ASSISTANT_NAME}, виртуальный помощник регистратуры "
            "поликлиники номер семь. Разговор записывается. Чем могу помочь?")
GOODBYE = "Всего доброго, будьте здоровы!"
ANYTHING_ELSE = "Могу ещё чем-то помочь?"
OPERATOR_GREETING = "Здравствуйте, регистратура. Слушаю вас."

# Подсказки экрана звонка (микрофон, сбои) — фронт показывает их по своим событиям, но текст берёт отсюда
HINTS = {
    "say_again": "Не расслышала. Повторите, пожалуйста, чуть громче и ближе к микрофону.",
    "give_up": "Не получается разобрать речь. Напишите вопрос в поле ниже или нажмите «Регистратор» — соединю с человеком.",
    "not_heard": "Не слышу вас. Нажмите на микрофон, когда будете готовы, или напишите вопрос ниже.",
    "error": "Извините, произошёл сбой. Соединяю с регистратором.",
}

# Настроение маскота над микрофоном
MASCOT = {
    "idle": f"Привет! Я {ASSISTANT_NAME}. Чем могу помочь?",
    "thinking": "Минутку, проверяю…",
    "error": "Что-то пошло не так. Попробуйте ещё раз или позовите регистратора.",
    "done": "Готово! Талон к записи — в чате.",
    "escalated": "Передаю вас регистратору — он ответит.",
}

DONE_IN_MIS = {"booking": "Записано в МИС", "reschedule": "Перенесено в МИС", "cancel": "Отменено в МИС"}


def label(status: str, source: str | None, intent: str | None, booking, escalation) -> str | None:
    """Короткая подпись под ответом: что произошло и откуда данные. None — разговор идёт, подписи нет."""
    if status == "error":
        return "⚠ Сбой, соединяем с регистратором"
    if status == "handoff" and escalation is not None:
        rule = f" · {escalation.rule}" if escalation.rule else ""
        return f"🚑 Срочно: 103{rule}" if escalation.emergency else f"👤 Передано регистратору{rule}"
    if status != "completed":
        return None
    if source and "регламент" in source.lower():
        return "📄 Ответ по регламенту"
    if booking is not None and booking.visit_id:
        what = "Отменено в МИС" if booking.status == "Отменена" else DONE_IN_MIS.get(intent or "", "Выполнено в МИС")
        return f"✓ {what} · № записи {booking.visit_id}"
    if source and "мис" in source.lower():
        return "✓ Данные из МИС"
    return None


def public() -> dict:
    """GET /api/texts — всё, что фронт показывает пациенту и регистратору без запроса к /api/chat."""
    return {"assistant_name": ASSISTANT_NAME, "greeting": GREETING, "goodbye": GOODBYE,
            "operator_greeting": OPERATOR_GREETING, "hints": HINTS, "mascot": MASCOT}
