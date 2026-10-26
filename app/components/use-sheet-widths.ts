"use client";
import { useContext, useEffect, useRef, useState } from "react";
import { CurrentUserId } from "./role-guide";
export function useSheetWidths(tableId: string) {
  const userId = useContext(CurrentUserId),
    key = `effectiveness-widths:v1:${userId}:${tableId}`;
  const [widths, setWidths] = useState<Record<string, number>>({}),
    [warning, setWarning] = useState("");
  const current = useRef<Record<string, number>>({});
  useEffect(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(key) || "{}");
      const valid: Record<string, number> = {};
      if (raw && typeof raw === "object" && !Array.isArray(raw))
        for (const [k, v] of Object.entries(raw).slice(0, 4000))
          if (
            /^(alias|advisor|country|currency|\d{4}-\d{2}-\d{2}(sales|budget|base|spend|fixedCost))$/.test(
              k,
            ) &&
            typeof v === "number" &&
            Number.isFinite(v) &&
            v >= 24 &&
            v <= 2000
          )
            valid[k] = v;
      current.current = valid;
      setWidths(valid);
    } catch {
      setWarning(
        "No se pudieron recuperar los anchos guardados en este navegador.",
      );
    }
  }, [key]);
  const resize = (column: string, width?: number) => {
    const next = { ...current.current };
    if (width === undefined) delete next[column];
    else next[column] = width;
    current.current = next;
    setWidths(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
      setWarning("");
    } catch {
      setWarning(
        "El navegador no permite guardar los anchos; se conservarán mientras esta tabla esté abierta.",
      );
    }
  };
  return { widths, resize, warning };
}
