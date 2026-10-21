"use client";

// Короткое всплывающее уведомление («В очереди: 3») — исчезает само через 4 секунды.

import { TOAST_MS } from "../config";
import { useCallback, useEffect, useRef, useState } from "react";

export function useToast(ms = TOAST_MS): { toast: string | null; show: (text: string) => void } {
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const show = useCallback((text: string) => {
    clearTimeout(timer.current);
    setToast(text);
    timer.current = setTimeout(() => setToast(null), ms);
  }, [ms]);
  useEffect(() => () => clearTimeout(timer.current), []);
  return { toast, show };
}
