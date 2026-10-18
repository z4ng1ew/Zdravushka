// Всплывающее уведомление внизу справа (текст — из хука useToast).

export default function Toast({ text }: { text: string | null }) {
  return text ? <div className="toast" role="status">{text}</div> : null;
}
