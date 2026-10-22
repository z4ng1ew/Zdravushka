import type { ReplyTag } from "@/shared/domain/replyTags";
import { useAssistantName } from "@/shared/hooks/useTexts";
import type { Speaker } from "@/shared/types/staff";

// Одна реплика разговора. У каждого участника свой цвет, подпись и аватарка (таблица SPEAKERS):
//  ИИ-ассистент — синий, «ИИ сказал» (имя — с сервера, GET /api/texts);  пациент — серый, «ИИ услышал»;  регистратор — зелёный.
// Всплывающих подсказок внутри ленты нет: лента прокручивается и обрезала бы их.
// Служебное (точность распознавания, кем понята фраза) — только при staff (кабинет регистратора).

const SPEAKERS: Record<Speaker, { label: string; name: string; img: string }> = {
  bot: { label: "ИИ сказал", name: "ИИ-помощник", img: "/img/mascot-circle.png" },
  operator: { label: "Регистратор", name: "Регистратор", img: "/img/avatar-staff.png" },
  patient: { label: "Пациент · ИИ услышал", name: "Пациент", img: "/img/avatar-patient.png" },
};

interface BubbleProps {
  speaker: Speaker; text: string; at: string;
  confidence?: number; // точность распознавания речи пациента, 0…1 — только регистратору
  operator?: string | null; // имя регистратора
  small?: boolean;
  staff?: boolean; // кабинет регистратора: показать служебные поля
  tags?: ReplyTag[]; // подпись под ответом ассистента (label с сервера)
  explain?: string; // понятное пояснение к ответу — мелко под бейджем
  tech?: string; // «понято нейросетью · распознано на 87 %» — только регистратору
  onReplay?: () => void; // «Повторить» — заново озвучить ответ
}

export default function Bubble({ speaker: raw, text, at, confidence, operator, small, staff, tags, explain, tech, onReplay }: BubbleProps) {
  const speaker: Speaker = SPEAKERS[raw] ? raw : "patient"; // незнакомый говорящий — как пациент
  const who = SPEAKERS[speaker];
  const name = useAssistantName();
  const label = speaker === "bot" ? `${name} · ${who.label}` : speaker === "operator" && operator ? `${who.label} ${operator}` : who.label;
  const avatar = <Avatar speaker={speaker} small={small} />;
  return (
    <div className={`row ${speaker}`}>
      {speaker !== "patient" && avatar}
      <div className="bubble-wrap">
        <div className="who">{label}</div>
        <div className="bubble">{text}</div>
        <Meta speaker={speaker} at={at} confidence={confidence} staff={staff} tags={tags} onReplay={onReplay} />
        {speaker === "bot" && <Note text={explain} />}
        {speaker === "bot" && staff && <Note text={tech} tech />}
      </div>
      {speaker === "patient" && avatar}
    </div>
  );
}

/** Строка под репликой: бейджи ответа, «Повторить», время; регистратору — точность распознавания */
function Meta({ speaker, at, confidence, staff, tags, onReplay }: Pick<BubbleProps, "at" | "confidence" | "staff" | "tags" | "onReplay"> & { speaker: Speaker }) {
  return (
    <div className="meta">
      {speaker === "patient" && staff && <Recognized confidence={confidence} />}
      {speaker === "bot" && tags?.map((t) => <span key={t.text} className={`rtag-src rtag-${t.tone}`}>{t.text}</span>)}
      {onReplay && <button type="button" className="replay" onClick={onReplay} aria-label="Повторить ответ голосом">🔁 Повторить</button>}
      <span>{at}</span>
    </div>
  );
}

/** Мелкая строка под бейджем; пустая — не показываем */
function Note({ text, tech }: { text?: unknown; tech?: boolean }) {
  return typeof text === "string" && text ? <div className={`reply-note${tech ? " reply-tech" : ""}`}>{text}</div> : null;
}

function Avatar({ speaker, small }: { speaker: Speaker; small?: boolean }) {
  const { name, img } = SPEAKERS[speaker];
  return (
    <div className={`ava ava-img ava-${speaker} ${small ? "ava-sm" : ""}`}>
      <img src={img} alt={name} />
    </div>
  );
}

/** «✓ Распознано 92%» — для регистратора */
function Recognized({ confidence }: { confidence?: number }) {
  const ok = confidence !== undefined && Number.isFinite(confidence);
  const pct = ok ? Math.round(Math.min(1, Math.max(0, confidence)) * 100) : null;
  return <span className="recog">✓ Распознано{pct !== null && ` ${pct}%`}</span>;
}

export function SpeakerLegend() {
  const name = useAssistantName();
  return (
    <div className="speaker-legend">
      <span><i className="dot-bot" />ИИ {name}</span>
      <span><i className="dot-patient" />Пациент</span>
      <span><i className="dot-op" />Регистратор</span>
    </div>
  );
}
