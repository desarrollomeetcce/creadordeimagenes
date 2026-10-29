"use client";
import { useId, useRef, useState } from "react";
import type { SheetOption } from "./sheet-search-select";
const key = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es");
/** One searchable, multiple-choice control. Empty selection means all only in filters. */
export function InventoryMultiSelect({
  label,
  options,
  values,
  onChange,
  placeholder = "Todos",
  disabled = false,
  onError,
  all = true,
  onCreate,
  createLabel = "Crear",
  compact = false,
  description,
  categoryFilter,
}: {
  label: string;
  options: (SheetOption & { searchText?: string })[];
  categoryFilter?: {
    options: SheetOption[];
    value: string;
    onChange: (value: string) => void;
  };
  values: string[];
  onChange: (v: string[]) => void | Promise<void>;
  placeholder?: string;
  disabled?: boolean;
  onError?: (v: string) => void;
  all?: boolean;
  onCreate?: (name: string, selected: string[]) => Promise<void>;
  createLabel?: string;
  compact?: boolean;
  description?: string;
}) {
  const id = useId(),
    popover = useRef<HTMLDivElement>(null),
    search = useRef<HTMLInputElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    pending = useRef(false);
  const [query, setQuery] = useState(""),
    [open, setOpen] = useState(false),
    [draft, setDraft] = useState(values),
    [busy, setBusy] = useState(false),
    [position, setPosition] = useState({ top: 8, left: 8 });
  const filtered = options.filter((o) =>
    key(query)
      .trim()
      .split(/\s+/)
      .every((w) => key(o.label + " " + (o.searchText ?? "")).includes(w)),
  );
  const chosen = all ? values : draft;
  const change = async (next: string[]) => {
    if (!all) {
      setDraft(next);
      return;
    }
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    try {
      await onChange(next);
    } catch (e) {
      onError?.((e as Error).message);
    } finally {
      setBusy(false);
      pending.current = false;
    }
  };
  const text =
    !compact && values.length
      ? options
          .filter((o) => values.includes(o.value))
          .map((o) => o.label)
          .join(", ")
      : placeholder;
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={
          "sheet-search-trigger inventory-multi-trigger" +
          (compact ? " inventory-category-add" : "")
        }
        aria-label={label}
        aria-expanded={open}
        popoverTarget={id}
        disabled={disabled || busy}
        title={compact ? label : text}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setPosition({
            left: Math.max(8, Math.min(r.left, innerWidth - 288)),
            top: Math.max(8, Math.min(r.bottom + 3, innerHeight - 330)),
          });
          setQuery("");
          setDraft(values);
        }}
      >
        <span>{text || placeholder}</span>
        {!compact && <span aria-hidden="true">⌄</span>}
      </button>
      <div
        ref={popover}
        id={id}
        popover="auto"
        className="sheet-search-popover inventory-multi-popover"
        style={{
          ...position,
          maxHeight: `calc(100dvh - ${position.top + 8}px)`,
        }}
        onToggle={(e) => {
          setOpen(e.newState === "open");
          if (e.newState === "open")
            search.current?.focus({ preventScroll: true });
        }}
      >
        {categoryFilter && (
          <label className="inventory-dropdown-category">
            Filtrar por categoría
            <select
              aria-label="Categoría del inventario"
              value={categoryFilter.value}
              disabled={disabled || busy}
              onChange={(e) => {
                setQuery("");
                categoryFilter.onChange(e.target.value);
              }}
            >
              {categoryFilter.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <input
          ref={search}
          type="search"
          aria-label={`Buscar ${label}`}
          placeholder="Escribe para buscar…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              popover.current?.hidePopover();
              trigger.current?.focus({ preventScroll: true });
            }
          }}
        />
        {description && (
          <p className="inventory-selection-description">{description}</p>
        )}
        <fieldset disabled={busy || disabled} aria-label={label}>
          {all && (
            <label>
              <input
                type="checkbox"
                checked={!values.length}
                onChange={() => void change([])}
              />
              Todos
            </label>
          )}
          {filtered.map((o) => (
            <label key={o.value}>
              <input
                type="checkbox"
                checked={chosen.includes(o.value)}
                onChange={(e) =>
                  void change(
                    e.target.checked
                      ? [...chosen, o.value]
                      : chosen.filter((v) => v !== o.value),
                  )
                }
              />
              {o.label}
            </label>
          ))}
          {!filtered.length && <p role="status">Sin coincidencias</p>}
        </fieldset>
        {onCreate &&
          query.trim() &&
          !options.some((o) => key(o.label).trim() === key(query).trim()) && (
            <button
              type="button"
              disabled={busy || disabled}
              onClick={async () => {
                if (pending.current) return;
                pending.current = true;
                setBusy(true);
                try {
                  await onCreate(query.trim(), draft);
                  popover.current?.hidePopover();
                  setQuery("");
                } catch (e) {
                  onError?.((e as Error).message);
                } finally {
                  setBusy(false);
                  pending.current = false;
                }
              }}
            >
              + {createLabel} «{query.trim()}»
            </button>
          )}
        <button
          type="button"
          disabled={busy || disabled}
          onClick={async () => {
            if (pending.current) return;
            pending.current = true;
            setBusy(true);
            try {
              if (!all) await onChange(draft);
              popover.current?.hidePopover();
              trigger.current?.focus({ preventScroll: true });
            } catch (e) {
              onError?.((e as Error).message);
            } finally {
              setBusy(false);
              pending.current = false;
            }
          }}
        >
          Listo
        </button>
        {busy && <small role="status">Guardando…</small>}
      </div>
    </>
  );
}
