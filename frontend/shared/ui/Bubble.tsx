import type { ReplyTag } from "@/shared/domain/replyTags";
import type { Speaker } from "@/shared/types/staff";

// Одна реплика разговора. У каждого участника свой цвет, подпись и аватарка (таблица SPEAKERS):
//  ИИ (Здравушка) — синий, «ИИ сказал»;  пациент — серый, «ИИ услышал» + точность;  регистратор — зелёный.

const SPEAKERS: Record<Speaker, { label: string; tip: string; name: string; img: string }> = {
  bot: {
    label: "Здравушка · ИИ сказал", tip: "Ответ голосового помощника (ИИ), озвучен синтезом речи",
    name: "ИИ Здравушка", img: "/img/mascot-circle.png",
  },
  operator: {
    label: "Регистратор", tip: "Живой регистратор, перехвативший разговор",
    name: "Регистратор", img: "/img/avatar-staff.png",
  },
  patient: {
    label: "Пациент · ИИ услышал", tip: "Так ИИ распознал речь пациента",
    name: "Пациент", img: "/img/avatar-patient.png",
  },
};

const TAG_TIP = "Статус и источник ответа (status / source от сервера)";

interface BubbleProps {
  speaker: Speaker; text: string; at: string;
  confidence?: number; // точность распознавания речи пациента, 0…1
  operator?: string | null; // имя регистратора
  small?: boolean;
  tags?: ReplyTag[]; // бейджи под ответом Здравушки
  onReplay?: () => void; // «Повторить» — заново озвучить ответ
}

export default function Bubble({ speaker, text, at, confidence, operator, small, tags, onReplay }: BubbleProps) {
  const who = SPEAKERS[speaker];
  const label = speaker === "operator" && operator ? `${who.label} ${operator}` : who.label;
  const avatar = <Avatar speaker={speaker} small={small} />;
  return (
    <div className={`row ${speaker}`}>
      {speaker !== "patient" && avatar}
      <div className="bubble-wrap">
        <div className="who" data-tip={who.tip}>{label}</div>
        <div className="bubble">{text}</div>
        <div className="meta">
          {speaker === "patient" && <Recognized confidence={confidence} />}
          {speaker === "bot" && tags?.map((t) => (
            <span key={t.text} className={`rtag-src rtag-${t.tone}`} data-tip={t.tip ?? TAG_TIP}>{t.text}</span>
          ))}
          {onReplay && (
            <button type="button" className="replay" onClick={onReplay} aria-label="Повторить ответ голосом" data-tip="Повторить голосом">🔁 Повторить</button>
          )}
          <span>{at}</span>
        </div>
      </div>
      {speaker === "patient" && avatar}
    </div>
  );
}

function Avatar({ speaker, small }: { speaker: Speaker; small?: boolean }) {
  const { name, img } = SPEAKERS[speaker];
  return (
    <div className={`ava ava-img ava-${speaker} ${small ? "ava-sm" : ""}`} data-tip={name}>
      <img src={img} alt={name} />
    </div>
  );
}

/** «✓ Распознано 92%» с подсказкой: при низкой точности ИИ переспросит */
function Recognized({ confidence }: { confidence?: number }) {
  const pct = confidence === undefined ? null : Math.round(confidence * 100);
  const tip = pct === null ? "Речь распознана ИИ" : `ИИ распознал речь с точностью ${pct}%. При низкой точности он переспросит.`;
  return <span className="recog" data-tip={tip}>✓ Распознано{pct !== null && ` ${pct}%`}</span>;
}

export function SpeakerLegend() {
  return (
    <div className="speaker-legend">
      <span><i className="dot-bot" />ИИ Здравушка</span>
      <span><i className="dot-patient" />Пациент</span>
      <span><i className="dot-op" />Регистратор</span>
    </div>
  );
}
