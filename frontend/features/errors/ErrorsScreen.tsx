// «Ошибки»: сбои МИС в звонках (с сервера) и ошибки запросов этого браузера.

import BrowserErrors from "./BrowserErrors";
import MisFailures from "./MisFailures";

export default function ErrorsScreen() {
  return (
    <>
      <h1 className="page-title">Ошибки</h1>
      <p className="page-sub">Сбои МИС в звонках ИИ (с сервера) и ошибки запросов этого браузера.</p>
      <h2 className="sub-h">Сбои МИС в звонках</h2>
      <MisFailures />
      <h2 className="sub-h">Ошибки запросов этого браузера</h2>
      <BrowserErrors />
    </>
  );
}
