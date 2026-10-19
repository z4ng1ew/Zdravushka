// Скачать текст файлом (журнал ошибок .log).

export function downloadText(text: string, filename: string): void {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a); // Firefox скачивает только по ссылке из документа
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000); // сразу освобождать нельзя — загрузка может не начаться
}
