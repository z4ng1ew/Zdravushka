// Строка таблицы, которая раскрывается по нажатию — мышью и с клавиатуры (Tab, затем Enter или пробел).

import type { KeyboardEvent } from "react";

export function toggleRow(open: boolean, toggle: () => void) {
  return {
    className: "clickable",
    tabIndex: 0,
    "aria-expanded": open,
    onClick: toggle,
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      toggle();
    },
  };
}
