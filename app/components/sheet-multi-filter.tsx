"use client";
import { useId, useRef, useState } from "react";
import type { SheetOption } from "./sheet-search-select";
const normalize = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es");
/** null means every current/future option; [] explicitly means no options. */
export function SheetMultiFilter({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: SheetOption[];
  value: string[] | null;
  onChange: (value: string[] | null) => void;
}) {
  const id = useId(),
    popover = useRef<HTMLDivElement>(null),
    input = useRef<HTMLInputElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState(""),
    [position, setPosition] = useState({ top: 8, left: 8 });
  const selected = new Set(value ?? options.map((o) => o.value));
  const all = value === null;
  const count = options.filter((o) => selected.has(o.value)).length;
  const words = normalize(query.trim()).split(/\s+/).filter(Boolean);
  const matchesAll = words.length === 1 && words[0] === "todos";
  const filtered = open
    ? options.filter(
        (o) => matchesAll || words.every((w) => normalize(o.label).includes(w)),
      )
    : [];
  const toggle = (key: string) => {
    const next = options
      .filter((o) =>
        o.value === key ? !selected.has(key) : selected.has(o.value),
      )
      .map((o) => o.value);
    onChange(next.length === options.length ? null : next);
  };
  return (
    <>
      <button
        type="button"
        ref={trigger}
        className="sheet-multi-trigger"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="dialog"
        popoverTarget={id}
        title={
          all
            ? `${label}: Todos`
            : `${label}: ${
                options
                  .filter((o) => selected.has(o.value))
                  .map((o) => o.label)
                  .join(", ") || "Ninguno"
              }`
        }
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setPosition({
            left: Math.max(8, Math.min(r.left, innerWidth - 328)),
            top: Math.max(8, Math.min(r.bottom + 3, innerHeight - 360)),
          });
          setQuery("");
        }}
      >
        <span>{label}</span>
        <small> · {all ? "Todos" : count || "Ninguno"}</small>
        <span aria-hidden="true"> ⌄</span>
      </button>
      <div
        id={id}
        ref={popover}
        role="dialog"
        aria-label={label}
        popover="auto"
        className="sheet-multi-popover"
        style={{
          ...position,
          maxHeight: `calc(100dvh - ${position.top + 8}px)`,
        }}
        onToggle={(e) => {
          const next = e.newState === "open";
          setOpen(next);
          if (next) input.current?.focus({ preventScroll: true });
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            popover.current?.hidePopover();
            trigger.current?.focus({ preventScroll: true });
          }
        }}
      >
        <input
          ref={input}
          type="search"
          aria-label={`Buscar en ${label}`}
          placeholder="Buscar por nombre o abreviatura…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (matchesAll) onChange(all ? [] : null);
              else if (filtered.length === 1) toggle(filtered[0].value);
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              popover.current
                ?.querySelector<HTMLInputElement>(".sheet-multi-options input")
                ?.focus();
            }
          }}
        />
        <label className="sheet-multi-all">
          <input
            type="checkbox"
            checked={all}
            ref={(el) => {
              if (el) el.indeterminate = !all && count > 0;
            }}
            onChange={() => onChange(all ? [] : null)}
          />
          Todos
        </label>
        <div
          className="sheet-multi-options"
          role="group"
          aria-label={`Opciones de ${label}`}
        >
          {filtered.map((o) => (
            <label key={o.value}>
              <input
                type="checkbox"
                checked={selected.has(o.value)}
                onChange={() => toggle(o.value)}
              />
              <span>{o.label}</span>
            </label>
          ))}
          {!filtered.length && (
            <p role="status">
              {options.length
                ? "Sin coincidencias"
                : "No hay opciones en esta tabla"}
            </p>
          )}
        </div>
        <footer>
          <small>
            {count}/{options.length} seleccionados
          </small>
          <button
            type="button"
            onClick={() => {
              popover.current?.hidePopover();
              trigger.current?.focus({ preventScroll: true });
            }}
          >
            Cerrar
          </button>
        </footer>
      </div>
    </>
  );
}
