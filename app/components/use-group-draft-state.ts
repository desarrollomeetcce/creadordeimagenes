"use client";
import { useRef, useState, type SetStateAction } from "react";
/** Window-local drafts survive view changes without storing financial data in browser preferences. */
export function useGroupDraftState<T>(key: string, initial: T | (() => T)) {
  const defaults = useRef(new Map<string, T>());
  if (!defaults.current.has(key))
    defaults.current.set(
      key,
      typeof initial === "function" ? (initial as () => T)() : initial,
    );
  const [drafts, setDrafts] = useState<Record<string, T>>({});
  const value = Object.hasOwn(drafts, key)
    ? drafts[key]
    : defaults.current.get(key)!;
  const setValue = (next: SetStateAction<T>) =>
    setDrafts((current) => {
      const prior = Object.hasOwn(current, key)
        ? current[key]
        : defaults.current.get(key)!;
      const result =
        typeof next === "function" ? (next as (value: T) => T)(prior) : next;
      return Object.is(prior, result) ? current : { ...current, [key]: result };
    });
  return [value, setValue] as const;
}
