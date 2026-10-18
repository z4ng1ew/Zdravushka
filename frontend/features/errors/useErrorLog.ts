"use client";

// Журнал ошибок этого браузера с обновлением (в том числе из соседней вкладки пациента).

import { useEffect, useState } from "react";
import { POLL } from "@/shared/config";
import { clearErrors, readErrors, type ErrorEntry } from "@/shared/api/errorLog";

export function useErrorLog(): { list: ErrorEntry[]; clear: () => void } {
  const [list, setList] = useState<ErrorEntry[]>([]);
  useEffect(() => {
    const load = () => setList(readErrors());
    load();
    window.addEventListener("storage", load);
    const t = setInterval(load, POLL.errorLog);
    return () => { window.removeEventListener("storage", load); clearInterval(t); };
  }, []);
  return { list, clear: () => { clearErrors(); setList([]); } };
}
