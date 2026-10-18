// Печать одного блока страницы (талона): остальное скрывает @media print в styles/40-responsive.css.

export function printOne(el: HTMLElement | null) {
  if (!el) return;
  el.classList.add("printing");
  document.body.classList.add("print-one");
  window.print();
  document.body.classList.remove("print-one");
  el.classList.remove("printing");
}
