// «Настройки» кабинета: состояние сервера и данные этого браузера.

import BrowserDataSection from "./BrowserDataSection";
import ServerSection from "./ServerSection";

export default function SettingsScreen() {
  return (
    <>
      <div className="panel-head">
        <h1 className="panel-title">Настройки</h1>
        <span className="panel-sub">Сервер, ошибки и данные этого браузера</span>
      </div>
      <ServerSection />
      <BrowserDataSection />
    </>
  );
}
