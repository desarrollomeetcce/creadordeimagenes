"use client";
import { useContext, useEffect, useRef, useState } from "react";
import { CurrentUserId } from "./role-guide";
import {
  parseTemporaryCategories,
  type TemporaryCategoryMap,
} from "../../lib/meta-ads/financial-categories";
export function useFinancialCategories(tableId: string) {
  const userId = useContext(CurrentUserId),
    key = `effectiveness-temporary-categories:v1:${userId}:${tableId}`;
  const [temporary, setTemporary] = useState<TemporaryCategoryMap>({}),
    [warning, setWarning] = useState("");
  const current = useRef<TemporaryCategoryMap>({});
  useEffect(() => {
    let value: TemporaryCategoryMap = {};
    try {
      value = parseTemporaryCategories(localStorage.getItem(key));
      setWarning("");
    } catch {
      setWarning(
        "No se pudieron recuperar las categorías temporales de esta vista.",
      );
    }
    current.current = value;
    setTemporary(value);
  }, [key]);
  const choose = (row: string, ids: string[], defaults: string[]) => {
    const next = { ...current.current };
    const unique = [...new Set(ids)];
    if (
      !unique.length ||
      (unique.length === defaults.length &&
        unique.every((id) => defaults.includes(id)))
    )
      delete next[row];
    else next[row] = unique;
    current.current = next;
    setTemporary(next);
    try {
      const text = JSON.stringify(next);
      if (text.length > 2097152 || Object.keys(next).length > 4000)
        throw Error("limit");
      localStorage.setItem(key, text);
      setWarning("");
    } catch {
      setWarning(
        "Las categorías temporales se conservarán solo mientras esta vista permanezca abierta; el navegador no pudo guardarlas.",
      );
    }
  };
  const forget = (keys: string[]) => {
    const next = { ...current.current };
    for (const key of keys) delete next[key];
    current.current = next;
    setTemporary(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      setWarning(
        "No se pudo guardar la eliminación de categorías temporales en este navegador.",
      );
    }
  };
  return { temporary, choose, forget, warning };
}
