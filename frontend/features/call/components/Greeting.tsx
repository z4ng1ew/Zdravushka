// Ассистент над микрофоном: картинка и фраза меняются по ходу звонка (model/mascot.ts).
// Все четыре картинки лежат друг на друге — смена плавная, без мигания при загрузке.
// Фраза — с сервера; пока тексты не пришли — только картинка.

import { MOOD_IMG, type Mood } from "../model/mascot";

const MOODS = Object.keys(MOOD_IMG) as Mood[];

export default function Greeting({ mood = "idle", text = "" }: { mood?: Mood; text?: string }) {
  return (
    <div className={`greeting mood-${mood}`}>
      <div className="mascot-stack" aria-hidden="true">
        {MOODS.map((m) => (
          <img key={m} src={MOOD_IMG[m]} width={118} height={126} alt="" className={`mascot-img${m === mood ? " on" : ""}`} />
        ))}
      </div>
      {text && <p key={text} className="mascot-say" role="status" aria-live="polite">{text}</p>}
    </div>
  );
}
