"use client";
import { useId, useRef, useState } from "react";
export type SheetOption = { value: string; label: string };
const normalize = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es");
/** Searchable, themed choices. Typing only searches; selecting explicitly commits. */
export function SheetSearchSelect({
  label,
  value,
  options,
  placeholder = "Sin asignar",
  onSelect,
  onError,
  className = "",
  compact = false,
  displayLabel = false,
  onCreate,
  createLabel = "Añadir nuevo",
  disabled = false,
}: {
  label: string;
  value: string;
  options: SheetOption[];
  placeholder?: string;
  onSelect: (v: string) => void | Promise<void>;
  onError?: (message: string) => void;
  className?: string;
  compact?: boolean;
  displayLabel?: boolean;
  onCreate?: (name: string) => void | Promise<void>;
  createLabel?: string;
  disabled?: boolean;
}) {
  const id = useId(),
    popover = useRef<HTMLDivElement>(null),
    search = useRef<HTMLInputElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
  const action = useRef(onSelect),
    pending = useRef(false);
  const [query, setQuery] = useState(""),
    [index, setIndex] = useState(0),
    [busy, setBusy] = useState(false),
    [open, setOpen] = useState(false),
    [position, setPosition] = useState({ top: 8, left: 8 });
  const filtered = open
    ? options.filter((o) =>
        normalize(o.label + " " + o.value).includes(normalize(query.trim())),
      )
    : [];
  const choose = async (v: string, create = false) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    try {
      if (create) await onCreate?.(v);
      else await action.current(v);
      popover.current?.hidePopover();
      trigger.current?.focus({ preventScroll: true });
    } catch (e) {
      onError?.(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={"sheet-search-trigger " + className}
        aria-label={label}
        disabled={busy || disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        popoverTarget={id}
        title={options.find((o) => o.value === value)?.label || placeholder}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setPosition({
            left: Math.max(8, Math.min(r.left, innerWidth - 288)),
            top: Math.max(8, Math.min(r.bottom + 3, innerHeight - 330)),
          });
          setQuery("");
          setIndex(0);
          action.current = onSelect;
        }}
      >
        <span>
          {value
            ? compact && !displayLabel
              ? value
              : options.find((o) => o.value === value)?.label || value
            : placeholder}
        </span>
        <span aria-hidden="true">⌄</span>
      </button>
      <div
        id={id}
        popover="auto"
        ref={popover}
        className="sheet-search-popover"
        style={{
          ...position,
          maxHeight: `calc(100dvh - ${position.top + 8}px)`,
        }}
        onToggle={(e) => {
          const next = e.newState === "open";
          setOpen(next);
          if (next) search.current?.focus({ preventScroll: true });
        }}
      >
        <input
          ref={search}
          type="search"
          role="combobox"
          aria-label={`Buscar ${label}`}
          aria-controls={id + "-list"}
          aria-expanded={open}
          aria-autocomplete="list"
          aria-activedescendant={
            filtered[index] ? id + "-option-" + index : undefined
          }
          placeholder="Escribe nombre o código…"
          value={query}
          disabled={busy}
          onChange={(e) => {
            setQuery(e.target.value);
            setIndex(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              const next = Math.max(
                0,
                Math.min(
                  filtered.length - 1,
                  index + (e.key === "ArrowDown" ? 1 : -1),
                ),
              );
              setIndex(next);
              document
                .getElementById(id + "-option-" + next)
                ?.scrollIntoView({ block: "nearest" });
            } else if (e.key === "Enter") {
              e.preventDefault();
              if (filtered[index]) void choose(filtered[index].value);
            } else if (e.key === "Escape") {
              e.preventDefault();
              popover.current?.hidePopover();
              trigger.current?.focus({ preventScroll: true });
            }
          }}
        />
        <div
          id={id + "-list"}
          role="listbox"
          aria-label={label}
          aria-busy={busy}
        >
          {filtered.map((o, i) => (
            <button
              id={id + "-option-" + i}
              type="button"
              role="option"
              aria-selected={o.value === value}
              data-highlighted={i === index}
              key={o.value}
              disabled={busy}
              onClick={() => void choose(o.value)}
            >
              {o.label}
            </button>
          ))}
          {!filtered.length && <p role="status">Sin coincidencias</p>}
        </div>
        {onCreate &&
          query.trim() &&
          !options.some(
            (o) =>
              normalize(o.label) === normalize(query.trim()) ||
              normalize(o.value) === normalize(query.trim()),
          ) && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void choose(query.trim(), true)}
            >
              + {createLabel} «{query.trim()}»
            </button>
          )}
        {busy && <small role="status">Guardando…</small>}
      </div>
    </>
  );
}
