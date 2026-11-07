"use client";
import { useId, useMemo, useState, type KeyboardEvent } from "react";
import { costKey } from "../../lib/cost-ledger";
export function CostChoice({
  value,
  options,
  label,
  disabled,
  onChange,
  onKeyDown,
  row,
  col,
}: {
  value: string;
  options: string[];
  label: string;
  disabled?: boolean;
  onChange: (v: string) => void;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
  row?: string;
  col?: number;
}) {
  const id = useId(),
    [open, setOpen] = useState(false),
    [text, setText] = useState<string | null>(null),
    [active, setActive] = useState(0);
  const matches = useMemo(() => {
    const needle = costKey(text ?? ""),
      found: string[] = [];
    for (const option of options) {
      if (costKey(option).includes(needle)) found.push(option);
      if (found.length === 30) break;
    }
    return found;
  }, [options, text]);
  function select(v: string) {
    if (v !== value) onChange(v);
    setText(null);
    setOpen(false);
  }
  return (
    <div className="fc-choice">
      <input
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        aria-autocomplete="list"
        aria-activedescendant={
          open && matches[active] ? id + active : undefined
        }
        value={text ?? value}
        disabled={disabled}
        data-row={row}
        data-col={col}
        onFocus={() => {
          setOpen(true);
          setActive(0);
        }}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onBlur={() => {
          const exact = options.find(
            (v) => costKey(v) === costKey(text ?? value),
          );
          if (text !== null && exact && exact !== value) onChange(exact);
          else if (text === "" && value) onChange("");
          setText(null);
          setOpen(false);
        }}
        onKeyDown={(e) => {
          if (open && ["ArrowDown", "ArrowUp"].includes(e.key)) {
            e.preventDefault();
            setActive((a) =>
              Math.max(
                0,
                Math.min(
                  matches.length - 1,
                  a + (e.key === "ArrowDown" ? 1 : -1),
                ),
              ),
            );
            return;
          }
          if (open && e.key === "Enter" && matches[active]) {
            e.preventDefault();
            select(matches[active]);
            return;
          }
          if (e.key === "Escape") {
            setText(null);
            setOpen(false);
            return;
          }
          onKeyDown?.(e);
        }}
      />
      {open && !disabled && (
        <div id={id} role="listbox" className="fc-choice-options">
          {matches.map((v, i) => (
            <button
              type="button"
              role="option"
              aria-selected={i === active}
              id={id + i}
              key={v}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => select(v)}
            >
              {v}
            </button>
          ))}
          {!matches.length && (
            <span>Sin coincidencias · añádelo al catálogo</span>
          )}
        </div>
      )}
    </div>
  );
}
