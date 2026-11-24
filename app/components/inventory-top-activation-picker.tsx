"use client";
import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { categoryKey } from "../../lib/meta-ads/category-paste";
import { normalizeSearchText, searchTerms } from "../../lib/search";

type Choice = { id: string; name: string; primaryNames: string[] };
export function InventoryTopActivationPicker({
  label,
  choices,
  disabled,
  onSelect,
}: {
  label: string;
  choices: Choice[];
  disabled: boolean;
  onSelect: (name: string) => Promise<boolean>;
}) {
  const id = useId(),
    trigger = useRef<HTMLButtonElement>(null),
    panel = useRef<HTMLDivElement>(null),
    search = useRef<HTMLInputElement>(null),
    pending = useRef(false);
  const [open, setOpen] = useState(false),
    [mode, setMode] = useState<"list" | "category">("list"),
    [query, setQuery] = useState(""),
    [index, setIndex] = useState(0),
    [limit, setLimit] = useState(25),
    [expanded, setExpanded] = useState<Record<string, boolean>>({}),
    [limits, setLimits] = useState<Record<string, number>>({}),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [position, setPosition] = useState({ left: 8, top: 8 });
  const entries = useMemo(
    () =>
      open
        ? choices.map((item) => ({
            item,
            search: normalizeSearchText(item.name),
          }))
        : [],
    [choices, open],
  );
  const groups = useMemo(() => {
    if (!open || mode !== "category") return [];
    const grouped = new Map<
      string,
      { key: string; name: string; search: string; items: Choice[] }
    >();
    for (const item of choices)
      for (const name of new Set(
        item.primaryNames.length
          ? item.primaryNames
          : ["Sin categoría principal"],
      )) {
        const key = categoryKey(name),
          group = grouped.get(key) ?? {
            key,
            name,
            search: normalizeSearchText(name),
            items: [],
          };
        group.items.push(item);
        grouped.set(key, group);
      }
    return [...grouped.values()].sort((a, b) =>
      a.name.localeCompare(b.name, "es"),
    );
  }, [choices, open, mode]);
  const words = useMemo(() => searchTerms(query), [query]);
  const filtered = useMemo(
    () =>
      entries
        .filter((entry) => words.every((word) => entry.search.includes(word)))
        .map((entry) => entry.item),
    [entries, words],
  );
  const filteredGroups = useMemo(
    () =>
      groups.filter((group) =>
        words.every((word) => group.search.includes(word)),
      ),
    [groups, words],
  );
  const close = () => {
    panel.current?.hidePopover();
    requestAnimationFrame(() =>
      trigger.current?.focus({ preventScroll: true }),
    );
  };
  const choose = async (item: Choice) => {
    if (pending.current || disabled) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      if (await onSelect(item.name)) close();
      else setError("No se pudo activar. Revisa el aviso del Top.");
    } catch {
      setError("No se pudo activar. Actualiza el Top e inténtalo de nuevo.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  const switchMode = (next: "list" | "category") => {
    setMode(next);
    setQuery("");
    setIndex(0);
    setLimit(25);
    setExpanded({});
    setLimits({});
    search.current?.focus();
  };
  const keyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (mode !== "list") {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        panel.current
          ?.querySelector<HTMLButtonElement>("[data-top-category]")
          ?.focus();
      }
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const next = Math.max(
        0,
        Math.min(
          filtered.length - 1,
          index + (event.key === "ArrowDown" ? 1 : -1),
        ),
      );
      setIndex(next);
      setLimit((current) => Math.max(current, next + 1));
      requestAnimationFrame(() =>
        document
          .getElementById(id + "-option-" + next)
          ?.scrollIntoView({ block: "nearest" }),
      );
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (filtered[index]) void choose(filtered[index]);
    }
  };
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="sheet-search-trigger"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        popoverTarget={id}
        disabled={disabled || busy}
        onClick={(event) => {
          const bounds = event.currentTarget.getBoundingClientRect();
          setPosition({
            left: Math.max(8, Math.min(bounds.left, innerWidth - 368)),
            top: Math.max(8, Math.min(bounds.bottom + 3, innerHeight - 440)),
          });
          setQuery("");
          setIndex(0);
          setLimit(25);
          setError("");
        }}
      >
        <span>Buscar y seleccionar…</span>
        <span aria-hidden="true">⌄</span>
      </button>
      <div
        ref={panel}
        id={id}
        popover="auto"
        role="dialog"
        aria-label={label}
        className="inventory-top-picker"
        style={{
          ...position,
          maxHeight: `calc(100dvh - ${position.top + 8}px)`,
        }}
        onToggle={(event) => {
          setOpen(event.newState === "open");
          if (event.newState === "open")
            search.current?.focus({ preventScroll: true });
        }}
      >
        <header>
          <strong>Activar otro diplomado</strong>
          <button
            type="button"
            aria-label="Cerrar selector de diplomados"
            disabled={busy}
            onClick={close}
          >
            ×
          </button>
        </header>
        <div
          role="group"
          aria-label="Vista para elegir diplomado"
          className="inventory-top-picker-modes"
        >
          <button
            type="button"
            aria-pressed={mode === "list"}
            disabled={busy}
            onClick={() => switchMode("list")}
          >
            Lista
          </button>
          <button
            type="button"
            aria-pressed={mode === "category"}
            disabled={busy}
            onClick={() => switchMode("category")}
          >
            Categorías
          </button>
        </div>
        <input
          ref={search}
          type="search"
          role={mode === "list" ? "combobox" : "searchbox"}
          aria-label={
            mode === "list"
              ? "Buscar diplomado para activar"
              : "Buscar categoría principal"
          }
          placeholder={
            mode === "list" ? "Escribe el diplomado…" : "Escribe categoría…"
          }
          aria-expanded={mode === "list" ? open : undefined}
          aria-controls={id + "-results"}
          aria-activedescendant={
            mode === "list" && filtered[index]
              ? id + "-option-" + index
              : undefined
          }
          value={query}
          disabled={busy}
          onKeyDown={keyDown}
          onChange={(event) => {
            setQuery(event.target.value);
            setIndex(0);
            setLimit(25);
            setExpanded({});
            setLimits({});
          }}
        />
        {open && (
          <div
            id={id + "-results"}
            className="inventory-top-picker-results"
            role={mode === "list" ? "listbox" : undefined}
            aria-label={mode === "list" ? "Diplomados disponibles" : undefined}
            aria-busy={busy}
          >
            {mode === "list" ? (
              <>
                {filtered.slice(0, limit).map((item, i) => (
                  <button
                    key={item.id}
                    id={id + "-option-" + i}
                    type="button"
                    role="option"
                    aria-selected={false}
                    data-highlighted={i === index}
                    disabled={busy || disabled}
                    onClick={() => void choose(item)}
                  >
                    {item.name}
                  </button>
                ))}
                {filtered.length > limit && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setLimit((current) => current + 25)}
                  >
                    Mostrar 25 más · {filtered.length - limit} restantes
                  </button>
                )}
                {!filtered.length && (
                  <p role="status">
                    No hay diplomados disponibles con ese nombre.
                  </p>
                )}
              </>
            ) : (
              <>
                {filteredGroups.map((group) => {
                  const isExpanded = Object.hasOwn(expanded, group.key)
                      ? expanded[group.key]
                      : !!query.trim(),
                    count = Object.hasOwn(limits, group.key)
                      ? limits[group.key]
                      : 25;
                  return (
                    <section key={group.key}>
                      <button
                        type="button"
                        data-top-category={group.key}
                        aria-expanded={isExpanded}
                        aria-controls={
                          id + "-category-" + encodeURIComponent(group.key)
                        }
                        disabled={busy}
                        className="inventory-top-picker-category"
                        onClick={() =>
                          setExpanded((current) => ({
                            ...current,
                            [group.key]: !isExpanded,
                          }))
                        }
                      >
                        <span aria-hidden="true">{isExpanded ? "▾" : "▸"}</span>
                        <strong>{group.name}</strong>
                        <small>{group.items.length}</small>
                      </button>
                      {isExpanded && (
                        <div
                          id={id + "-category-" + encodeURIComponent(group.key)}
                          role="group"
                          aria-label={group.name}
                        >
                          {group.items.slice(0, count).map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              disabled={busy || disabled}
                              onClick={() => void choose(item)}
                            >
                              {item.name}
                            </button>
                          ))}
                          {group.items.length > count && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                setLimits((current) => ({
                                  ...current,
                                  [group.key]: count + 25,
                                }))
                              }
                            >
                              Mostrar 25 más
                            </button>
                          )}
                        </div>
                      )}
                    </section>
                  );
                })}
                {!filteredGroups.length && (
                  <p role="status">
                    No hay categorías disponibles con ese nombre.
                  </p>
                )}
              </>
            )}
          </div>
        )}
        {busy && <small role="status">Activando diplomado…</small>}
        {error && <p role="alert">{error}</p>}
      </div>
    </>
  );
}
