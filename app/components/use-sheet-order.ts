"use client";
import { useContext, useEffect, useState } from "react";
import { CurrentUserId } from "./role-guide";
/** Local workbook layout, isolated by user; source records and table identities never change. */
export function useSheetOrder(tables: { id: string }[]) {
  const userId = useContext(CurrentUserId),
    key = `effectiveness-sheet-order:v1:${userId}`;
  const [saved, setSaved] = useState<string[]>([]),
    [warning, setWarning] = useState("");
  useEffect(() => {
    setSaved([]);
    setWarning("");
    try {
      const raw = JSON.parse(localStorage.getItem(key) || "[]");
      if (Array.isArray(raw))
        setSaved(
          [
            ...new Set(
              raw.filter(
                (id): id is string =>
                  typeof id === "string" && id.length > 0 && id.length <= 100,
              ),
            ),
          ].slice(0, 100),
        );
    } catch {
      setWarning("El navegador no permite recuperar el orden de las hojas.");
    }
  }, [key]);
  const known = new Set(tables.map((t) => t.id));
  const ids = [
    ...saved.filter((id) => known.has(id)),
    ...tables.map((t) => t.id).filter((id) => !saved.includes(id)),
  ];
  const persist = (next: string[]) => {
    setSaved(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
      setWarning("");
    } catch {
      setWarning(
        "El orden cambió, pero el navegador impide guardarlo para próximas visitas.",
      );
    }
  };
  const append = (id: string) => {
    if (id && id.length <= 100 && !ids.includes(id)) persist([...ids, id]);
  };
  const move = (from: string, to: string, after = false) => {
    if (from === to || !known.has(from) || !known.has(to)) return false;
    const next = ids.filter((id) => id !== from),
      index = next.indexOf(to) + (after ? 1 : 0);
    next.splice(index, 0, from);
    if (next.every((id, i) => id === ids[i])) return false;
    persist(next);
    return true;
  };
  return { ids, move, append, warning };
}
