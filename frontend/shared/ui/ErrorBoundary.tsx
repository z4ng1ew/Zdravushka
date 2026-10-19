"use client";

// Защита от «белого экрана»: если экран упал с ошибкой, показываем понятное сообщение
// и кнопку «Обновить», а ошибку пишем в журнал (страница «Ошибки»).
// Подключён в app/layout.tsx (вся страница) и в каркасе кабинета (только содержимое — меню остаётся).
// resetKey — сменился (например, адрес страницы) — пробуем показать содержимое снова.

import { Component, type ReactNode } from "react";
import { ApiError } from "../api/ApiError";
import { logError } from "../api/errorLog";

interface Props { children: ReactNode; resetKey?: string; inline?: boolean }
interface State { failed: boolean }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    const text = error instanceof Error ? error.message : String(error);
    const where = typeof location === "undefined" ? "?" : location.pathname;
    logError(new ApiError(null, "UI", where, `Сбой экрана: ${text}`), "интерфейс");
  }

  componentDidUpdate(prev: Props) {
    if (this.state.failed && prev.resetKey !== this.props.resetKey) this.setState({ failed: false });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return this.props.inline ? <CrashCard /> : <main className="page"><CrashCard /></main>;
  }
}

function CrashCard() {
  return (
    <div className="card crash" role="alert">
      <img src="/img/mascot-circle.png" width={96} height={96} alt="" />
      <h2>Что-то пошло не так</h2>
      <p>Страница не смогла открыться. Обновите её — обычно этого достаточно.</p>
      <p>Если не помогает — позвоните в регистратуру. При угрозе жизни — <b>103 / 112</b>.</p>
      <div className="btn-row">
        <button className="btn" onClick={() => location.reload()}>Обновить страницу</button>
        <a className="btn" href="/">На главную</a>
      </div>
    </div>
  );
}
