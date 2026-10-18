"use client";

// Раскрывающаяся панель внизу экрана пациента: «Что понял Здравушка» и «Запись на приём».
// Красная точка — в свёрнутой панели появилось новое.

import { useState } from "react";
import { intentLabel } from "@/shared/domain/intents";
import { ClipIcon, DocIcon } from "@/shared/ui/Icons";
import type { CallState } from "../model/callState";
import { recordTag } from "../model/callView";
import RecordCard from "./RecordCard";
import UnderstoodCard from "./UnderstoodCard";

export default function DetailsPanel({ call, onChoose }: { call: CallState; onChoose: (i: number) => void }) {
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState("");
  const tag = recordTag(call);
  const count = Object.keys(call.fields).length;
  const key = `${call.intent}|${count}|${tag.text}`;
  const hasNews = !open && key !== seen && (call.intent !== null || call.booking !== null || call.mode !== "ai");

  function toggle() {
    setOpen((o) => !o);
    setSeen(key);
  }

  return (
    <section className={`panel bottom-wrap ${open ? "open" : ""}`}>
      <button className="collapse-head" onClick={toggle} aria-expanded={open}>
        <span className="ch-item"><DocIcon /> Что понял Здравушка
          <span className="tag tag-info">{intentLabel(call.intent)}</span>
          {count > 0 && <span className="ch-count">{count} поля</span>}
        </span>
        <span className="ch-item"><ClipIcon /> Запись на приём<span className={`tag ${tag.cls}`}>{tag.text}</span></span>
        {hasNews && <span className="news-dot" title="Есть новое" />}
        <span className="chevron" aria-hidden="true">⌄</span>
      </button>
      {open && (
        <div className="bottom-panel">
          <div><UnderstoodCard intent={call.intent} fields={call.fields} /></div>
          <div><RecordCard call={call} onChoose={onChoose} /></div>
        </div>
      )}
    </section>
  );
}
