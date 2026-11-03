"use client";
import { useId, useRef, useState } from "react";
import { searchOptions } from "../../lib/search";
import type { SheetOption } from "./sheet-search-select";
const key = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es");
/** One searchable, multiple-choice control. Empty selection means all only in filters. */
export function InventoryMultiSelect({
  label,
  onOpen,
  options,
  values,
  onChange,
  placeholder = "Todos",
  disabled = false,
  onError,
  all = true,
  selectAll = false,
  onCreate,
  createLabel = "Crear",
  compact = false,
  description,
  categoryFilter,
  confirmLabel = "Listo",
  onAdd,
  addDisabled = false,
  existingValues = [],
}: {
  confirmLabel?: string;
  onAdd?: (values: string[]) => Promise<void>;
  addDisabled?: boolean;
  existingValues?: string[];
  onOpen?: () => void;
  label: string;
  options: SheetOption[];
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
  selectAll?: boolean;
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
    [localError, setLocalError] = useState(""),
    [position, setPosition] = useState({ top: 8, left: 8 });
  const filtered = open
    ? searchOptions(options, query, (o) => o.searchLabel ?? o.label)
    : [];
  const chosen = all ? values : draft;
  const existing = new Set(existingValues);
  const additions = draft.filter((v) => !existing.has(v));
  const alreadyPresent = draft.length - additions.length;
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
          onOpen?.();
          const r = e.currentTarget.getBoundingClientRect();
          setPosition({
            left: Math.max(8, Math.min(r.left, innerWidth - 288)),
            top: Math.max(8, Math.min(r.bottom + 3, innerHeight - 330)),
          });
          setQuery("");
          setLocalError("");
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
        className={
          "sheet-search-popover inventory-multi-popover" +
          (onAdd ? " inventory-multi-with-add" : "")
        }
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
          onChange={(e) => {
            setQuery(e.target.value);
            popover.current?.querySelector("fieldset")?.scrollTo(0, 0);
          }}
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
        {query.trim() && (
          <small role="status">
            {filtered.length} coincidencia{filtered.length === 1 ? "" : "s"}
          </small>
        )}
        <fieldset disabled={busy || disabled} aria-label={label}>
          {selectAll && !all && (
            <label>
              <input
                type="checkbox"
                checked={
                  !!options.length &&
                  options.every((o) => chosen.includes(o.value))
                }
                onChange={(e) =>
                  void change(
                    e.target.checked ? options.map((o) => o.value) : [],
                  )
                }
              />
              Todos
            </label>
          )}
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
          !options.some(
            (o) =>
              key(o.label).trim() === key(query).trim() ||
              key(o.value).trim() === key(query).trim(),
          ) && (
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
                  setLocalError((e as Error).message);
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
        {onAdd && alreadyPresent > 0 && (
          <small role="status" className="inventory-picker-existing">
            {additions.length
              ? `${alreadyPresent} ya están en esta hoja y país. Solo se agregarán ${additions.length} nuevos.`
              : "Ya está en esta hoja y país. Pulsa Buscar para verlo; no se agregará otra fila."}
          </small>
        )}
        <div className={onAdd ? "inventory-picker-actions" : undefined}>
          <button
            type="button"
            className={onAdd ? "inventory-picker-search" : undefined}
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
            {confirmLabel}
          </button>
          {onAdd && (
            <button
              type="button"
              className="inventory-picker-add"
              data-financial-write
              disabled={busy || disabled || addDisabled || !additions.length}
              onClick={async () => {
                if (pending.current) return;
                pending.current = true;
                setBusy(true);
                try {
                  setLocalError("");
                  await onAdd(additions);
                  popover.current?.hidePopover();
                  trigger.current?.focus({ preventScroll: true });
                } catch (e) {
                  setLocalError((e as Error).message);
                  onError?.((e as Error).message);
                } finally {
                  pending.current = false;
                  setBusy(false);
                }
              }}
            >
              Agregar
            </button>
          )}
        </div>
        {localError && (
          <p role="alert" className="notice error">
            {localError}
          </p>
        )}
        {busy && <small role="status">Guardando…</small>}
      </div>
    </>
  );
}
