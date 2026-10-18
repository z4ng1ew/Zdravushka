"use client";

// Защита от «белого экрана»: если экран упал с ошибкой, показываем понятное сообщение
// и кнопку «Обновить», а ошибку пишем в журнал (страница «Ошибки»). Подключён в app/layout.tsx.

import { Component, type ReactNode } from "react";
import { ApiError } from "../api/ApiError";
import { logError } from "../api/errorLog";

interface State { failed: boolean }

export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    const text = error instanceof Error ? error.message : String(error);
    logError(new ApiError(null, "UI", typeof location === "undefined" ? "?" : location.pathname, `Сбой экрана: ${text}`), "интерфейс");
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return <CrashScreen />;
  }
}

function CrashScreen() {
  return (
    <main className="page">
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
    </main>
  );
}
