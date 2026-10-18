import type { Metadata } from "next";
import { API_URL } from "@/shared/config";
import ErrorBoundary from "@/shared/ui/ErrorBoundary";
// Стили по экранам; порядок файлов = порядок каскада (styles/README.md)
import "@/styles/01-theme.css";
import "@/styles/02-layout.css";
import "@/styles/03-buttons.css";
import "@/styles/04-badges.css";
import "@/styles/05-tooltip.css";
import "@/styles/10-call-mic.css";
import "@/styles/12-call-dialog.css";
import "@/styles/13-call-details.css";
import "@/styles/20-cabinet-shell.css";
import "@/styles/21-cabinet-blocks.css";
import "@/styles/30-tickets.css";
import "@/styles/31-schedule.css";
import "@/styles/32-stats.css";
import "@/styles/40-responsive.css";
import "@/styles/41-a11y.css";

export const metadata: Metadata = {
  title: "ClinicAI — голосовой помощник поликлиники",
  description: "Здравушка записывает на приём, переносит и отменяет записи, напоминает о визитах",
};

// Политика безопасности страницы: скрипты, стили и картинки — только свои; запросы — только к своему серверу
// (или к NEXT_PUBLIC_API_URL при разработке). Микрофон и звук озвучки работают через blob:.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'", // Next.js кладёт данные страницы во встроенные скрипты
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "font-src 'self' data:",
  `connect-src 'self'${API_URL ? " " + API_URL : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <head>
        <meta httpEquiv="Content-Security-Policy" content={CSP} />
        <meta name="referrer" content="no-referrer" />
      </head>
      <body><ErrorBoundary>{children}</ErrorBoundary></body>
    </html>
  );
}
