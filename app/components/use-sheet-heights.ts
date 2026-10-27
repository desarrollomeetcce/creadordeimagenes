"use client";
import { useContext, useEffect, useRef, useState } from "react";
import { CurrentUserId } from "./role-guide";
/** Browser presentation only, scoped by person and stable worksheet identity. */
export function useSheetHeights(sheetId: string) {
  const userId = useContext(CurrentUserId),
    key = `effectiveness-heights:v1:${userId}:${sheetId}`;
  const [heights, setHeights] = useState<Record<string, number>>({}),
    [warning, setWarning] = useState("");
  const current = useRef<Record<string, number>>({});
  useEffect(() => {
    const valid: Record<string, number> = {};
    try {
      const raw = JSON.parse(localStorage.getItem(key) || "{}");
      if (raw && typeof raw === "object" && !Array.isArray(raw))
        for (const [k, v] of Object.entries(raw).slice(0, 4000))
          if (
            k.length <= 300 &&
            !["__proto__", "constructor", "prototype"].includes(k) &&
            typeof v === "number" &&
            Number.isFinite(v) &&
            v >= 24 &&
            v <= 1200
          )
            valid[k] = v;
      setWarning("");
    } catch {
      setWarning(
        "No se pudieron recuperar las alturas guardadas en este navegador.",
      );
    }
    current.current = valid;
    setHeights(valid);
  }, [key]);
  const resize = (row: string, height?: number) => {
    const next = { ...current.current };
    if (height === undefined) delete next[row];
    else next[row] = Math.max(24, Math.min(1200, height));
    current.current = next;
    setHeights(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
      setWarning("");
    } catch {
      setWarning(
        "El navegador no permite guardar las alturas; se conservarán mientras esta hoja esté abierta.",
      );
    }
  };
  return { heights, resize, warning };
}
