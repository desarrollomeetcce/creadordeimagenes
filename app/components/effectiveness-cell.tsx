"use client";
import { useEffect, useRef, useState } from "react";
/** Commits on Enter/Tab/blur, keeps failed drafts, and freezes the edit's revision. */
export function EffectivenessCell({
  value,
  label,
  onSave,
  onError,
  type = "text",
  list,
  onPaste,
  step,
  hint,
  locked = false,
  allowNA = false,
  manual = false,
  placeholder,
}: {
  value: string;
  label: string;
  onSave: (value: string) => Promise<void>;
  onError: (message: string) => void;
  type?: "text" | "number";
  list?: string;
  onPaste?: (text: string) => boolean;
  step?: string;
  hint?: string;
  locked?: boolean;
  allowNA?: boolean;
  manual?: boolean;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState(value),
    [state, setState] = useState<"idle" | "saving" | "error">("idle");
  const input = useRef<HTMLInputElement>(null),
    focused = useRef(false),
    dirty = useRef(false),
    pending = useRef(false),
    saved = useRef(value),
    action = useRef(onSave),
    escape = useRef(false);
  useEffect(() => {
    if (!focused.current && !dirty.current && !pending.current) {
      setDraft(value);
      saved.current = value;
      action.current = onSave;
    }
  }, [value, onSave]);
  const commit = async () => {
    if (escape.current) {
      escape.current = false;
      return;
    }
    if (!dirty.current || pending.current) return;
    if (!input.current?.checkValidity()) {
      setState("error");
      onError(`${label}: revisa el valor.`);
      return;
    }
    pending.current = true;
    setState("saving");
    try {
      await action.current(draft.trim());
      dirty.current = false;
      saved.current = draft.trim();
      setState("idle");
    } catch (e) {
      setState("error");
      onError(e instanceof Error ? e.message : "No se pudo guardar la celda.");
    } finally {
      pending.current = false;
    }
  };
  return (
    <input
      ref={input}
      className="sheet-cell"
      data-state={state}
      data-manual={manual || undefined}
      placeholder={placeholder}
      aria-label={label}
      aria-invalid={state === "error" || undefined}
      title={
        hint ??
        (state === "saving"
          ? "Guardando…"
          : state === "error"
            ? "No guardado. Corrige el valor o pulsa Escape para descartar."
            : value || "Escribe y pulsa Enter o Tab")
      }
      type={allowNA ? "text" : type}
      inputMode={allowNA ? "decimal" : undefined}
      list={list}
      min={type === "number" ? 0 : undefined}
      step={step}
      value={draft}
      readOnly={locked || state === "saving"}
      onFocus={() => {
        focused.current = true;
        if (!dirty.current) {
          saved.current = value;
          action.current = onSave;
        }
      }}
      onChange={(e) => {
        setDraft(e.target.value);
        dirty.current = e.target.value !== saved.current;
      }}
      onBlur={() => {
        focused.current = false;
        void commit();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          escape.current = true;
          dirty.current = false;
          setDraft(value);
          saved.current = value;
          setState("idle");
          input.current?.blur();
        } else if (e.key === "Enter") {
          e.preventDefault();
          input.current?.blur();
        }
      }}
      onPaste={(e) => {
        if (onPaste?.(e.clipboardData.getData("text"))) e.preventDefault();
      }}
    />
  );
}
