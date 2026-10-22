// Заголовок «Диалог» с легендой цветов, блок «Звоните 103 / 112» и строка об ограничениях кейса.

import type { ChatEscalation } from "@/shared/types/chat";
import { useAssistantName } from "@/shared/hooks/useTexts";
import { ChatIcon } from "@/shared/ui/Icons";

export function DialogTitle() {
  return (
    <h2 className="section-title right">
      <ChatIcon /> Диалог
      <span className="info" tabIndex={0} data-tip-pos="left"
        data-tip="Синие реплики — сказал ИИ-помощник. Серые — что ИИ услышал от пациента. Зелёные — живой регистратор. Красная цифра — ошибка сервера.">i</span>
    </h2>
  );
}

export function EmergencyBanner({ escalation }: { escalation: ChatEscalation | null }) {
  if (!escalation?.emergency) return null;
  return (
    <div className="emergency">
      <b>Звоните 103 или 112</b>
      <span>{escalation.reason ? `${escalation.reason}. ` : ""}Это может быть опасно — не ждите записи к врачу.</span>
    </div>
  );
}

export function RulesNote() {
  const name = useAssistantName(); // имя ассистента — с сервера (GET /api/texts)
  return (
    <div className="rules-note" data-tip-pos="top"
      data-tip="Ограничения кейса: ассистент не заменяет врача, а персональные данные маскируются в журналах.">
      {name} не ставит диагнозов и не даёт медицинских советов · при угрозе жизни — <b>103 / 112</b> · данные по 152-ФЗ
    </div>
  );
}
