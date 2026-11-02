"use client";
import { useContext, useEffect, useState, type SetStateAction } from "react";
import { CurrentUserId } from "./role-guide";
function readPreference<T extends string | string[] | null>(
  key: string,
  field: string,
  initial: T,
): T {
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
              : field === "itemFilter"
                ? 1500
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
}
/** Local view preferences are keyed by actual user + sheet; records remain server-backed. */
export function useWorkbookPreference<T extends string | string[] | null>(
  sheetId: string,
  field: string,
  initial: T,
) {
  const userId = useContext(CurrentUserId),
    key = `effectiveness-tab:v1:${userId}:${sheetId}:${field}`;
  const [state, setState] = useState(() => ({
    key,
    value: readPreference(key, field, initial),
  }));
  const value =
    state.key === key ? state.value : readPreference(key, field, initial);
  useEffect(() => {
    if (state.key !== key)
      setState({ key, value: readPreference(key, field, initial) });
  }, [key, state.key, field]);
  useEffect(() => {
    if (state.key !== key) return;
    try {
      localStorage.setItem(key, JSON.stringify(state.value));
    } catch {}
  }, [key, state]);
  const setValue = (next: SetStateAction<T>) =>
    setState((prev) => {
      const current =
        prev.key === key ? prev.value : readPreference(key, field, initial);
      return {
        key,
        value:
          typeof next === "function" ? (next as (p: T) => T)(current) : next,
      };
    });
  return [value, setValue] as const;
}
