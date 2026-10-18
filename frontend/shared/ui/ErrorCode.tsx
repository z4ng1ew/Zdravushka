import { describe } from "@/shared/api/errorLog";

// Ошибка — одной крупной цифрой. Что она значит — во всплывающей подсказке.
export default function ErrorCode({ status, detail }: { status: number | null; detail?: string }) {
  const tip = `${describe(status)}${detail ? ` — ${detail}` : ""}. Подробности — в журнале ошибок.`;
  return (
    <span className={`err-code ${status !== null && status < 500 ? "err-4xx" : "err-5xx"}`} data-tip={tip} tabIndex={0}>
      {status ?? "—"}
    </span>
  );
}

/** Ошибка на месте пустой страницы/таблицы */
export function ErrorBlock({ status, detail }: { status: number | null; detail?: string }) {
  return (
    <div className="card err-block">
      <ErrorCode status={status} detail={detail} />
    </div>
  );
}

/** Ошибка действия: цифра + короткая понятная причина рядом (409 — «идёт другой звонок», 503 — «МИС недоступна»…) */
export function ErrorInline({ status, detail }: { status: number | null; detail?: string }) {
  const text = status === 409 ? "Сейчас идёт другой звонок"
    : detail && detail.length <= 90 ? detail
    : describe(status);
  return (
    <span className="err-inline" role="alert">
      <ErrorCode status={status} detail={detail} />
      <span className="err-text">{text}</span>
    </span>
  );
}
