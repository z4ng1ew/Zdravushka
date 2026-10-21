// Быстрые фразы над полем ввода (видны до первой фразы пациента). Нажатие — как сказать фразу.

const QUICK = ["Запишите к терапевту на завтра", "Перенесите мою запись", "До скольки вы работаете?", "Позовите оператора"];

export default function QuickPhrases({ onSay }: { onSay: (text: string) => void }) {
  return (
    <div className="quick-chips" aria-label="Быстрые фразы">
      {QUICK.map((q) => <button key={q} type="button" className="chip" onClick={() => onSay(q)}>{q}</button>)}
    </div>
  );
}
