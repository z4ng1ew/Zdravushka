"use client";

// «Крупный шрифт» — режим для пожилых: увеличивает всю страницу на 125 %.
// Выбор запоминается в этом браузере (localStorage, без персональных данных).

import { useEffect, useState } from "react";
import { STORAGE } from "../config";

const KEY = STORAGE.bigFont;

function apply(on: boolean) {
  document.documentElement.classList.toggle("big-font", on);
}

export default function FontToggle() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let saved = false;
    try { saved = localStorage.getItem(KEY) === "1"; } catch { /* хранилище недоступно */ }
    setOn(saved);
    apply(saved);
  }, []);
  function toggle() {
    const next = !on;
    setOn(next);
    apply(next);
    try { localStorage.setItem(KEY, next ? "1" : "0"); } catch { /* хранилище недоступно */ }
  }
  return (
    <button type="button" className={`font-toggle ${on ? "on" : ""}`} onClick={toggle} aria-pressed={on}
      aria-label={on ? "Обычный шрифт" : "Крупный шрифт"} data-tip={on ? "Вернуть обычный размер" : "Крупный шрифт — всё на странице станет больше"} data-tip-pos="bottom">
      <span aria-hidden="true">Аа</span>
    </button>
  );
}
