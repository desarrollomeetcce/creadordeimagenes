"use client";
import { useContext, useEffect, useState, type SetStateAction } from "react";
import { CurrentUserId } from "./role-guide";
/** Non-financial UI preferences only. List records and names are persisted on the server. */
export function useWorkbookPreference<T extends string | string[] | null>(
  sheetId: string,
  field: string,
  initial: T,
) {
  const userId = useContext(CurrentUserId),
    key = `effectiveness-tab:v1:${userId}:${sheetId}:${field}`;
  const [value, setValue] = useState<T>(() => {
    if (typeof window === "undefined") return initial;
    try {
      const text = localStorage.getItem(key);
      if (text === null) return initial;
      const raw = JSON.parse(text);
      if (Array.isArray(initial) || initial === null) {
        if (raw === null) return (initial === null ? raw : initial) as T;
        if (
          Array.isArray(raw) &&
          raw.length <=
            (field === "catalogSelection"
              ? 10000
              : field === "catalogCategories"
                ? 1000
                : 100) &&
          raw.every((v) => typeof v === "string" && v.length <= 100)
        )
          return raw as T;
      } else if (typeof raw === "string" && raw.length <= 200) {
        if (
          (field === "since" || field === "until") &&
          !/^\d{4}-\d{2}-\d{2}$/.test(raw)
        )
          return initial;
        if (field === "mode" && !["manual", "automatic"].includes(raw))
          return initial;
        return raw as T;
      }
    } catch {}
    return initial;
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* Browser preferences are optional; actual records are server-backed. */
    }
  }, [key, value]);
  return [value, (next: SetStateAction<T>) => setValue(next)] as const;
}
