// Здравушка над микрофоном: картинка и фраза меняются по ходу звонка (model/mascot.ts).
// Все четыре картинки лежат друг на друге — смена плавная, без мигания при загрузке.

import { MOOD_VIEW, type Mood } from "../model/mascot";

const MOODS = Object.keys(MOOD_VIEW) as Mood[];

export default function Greeting({ mood = "idle", text = MOOD_VIEW.idle.text }: { mood?: Mood; text?: string }) {
  return (
    <div className={`greeting mood-${mood}`}>
      <div className="mascot-stack" aria-hidden="true">
        {MOODS.map((m) => (
          <img key={m} src={MOOD_VIEW[m].img} width={118} height={126} alt="" className={`mascot-img${m === mood ? " on" : ""}`} />
        ))}
      </div>
      <p key={text} className="mascot-say" role="status" aria-live="polite">{text}</p>
    </div>
  );
}
