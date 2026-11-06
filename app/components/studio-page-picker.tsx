"use client";
import { useEffect, useId, useMemo, useRef, useState } from "react";
export type StudioPage = {
  id: string;
  name: string;
  picture?: string;
  whatsapp?: string;
};
function PageLogo({ page }: { page: StudioPage }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [page.picture]);
  return page.picture && !failed ? (
    <img
      src={page.picture}
      alt=""
      width={36}
      height={36}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  ) : (
    <span className="studio-page-initial" aria-hidden="true">
      {page.name.slice(0, 2).toUpperCase()}
    </span>
  );
}
export function StudioPagePicker({
  pages,
  value,
  disabled,
  loading,
  onChange,
  pinScope,
  onRefresh,
  refreshDisabled,
}: {
  pages: StudioPage[];
  value: string;
  disabled: boolean;
  loading: boolean;
  onChange: (id: string) => void;
  pinScope: string;
  onRefresh: () => void;
  refreshDisabled: boolean;
}) {
  const id = useId(),
    root = useRef<HTMLDivElement>(null),
    dialog = useRef<HTMLDialogElement>(null),
    input = useRef<HTMLInputElement>(null),
    skipFocus = useRef(false);
  const pinKey = "studio-page-pins:v1:" + pinScope,
    [pins, setPins] = useState<string[]>([]);
  useEffect(() => {
    setPins([]);
    try {
      const v = JSON.parse(localStorage.getItem(pinKey) || "[]");
      if (Array.isArray(v))
        setPins(
          [
            ...new Set(
              v.filter(
                (x): x is string =>
                  typeof x === "string" && /^\d{1,40}$/.test(x),
              ),
            ),
          ].slice(0, 12),
        );
    } catch {}
  }, [pinKey]);
  const aliasKey = "studio-page-pin-alias:v1:" + pinScope;
  const [aliases, setAliases] = useState<Record<string, string>>({}),
    [alias, setAlias] = useState("");
  useEffect(() => {
    setAliases({});
    try {
      const v = JSON.parse(localStorage.getItem(aliasKey) || "{}");
      if (v && typeof v === "object" && !Array.isArray(v))
        setAliases(
          Object.fromEntries(
            Object.entries(v)
              .filter(
                ([k, v]) =>
                  /^\d{1,40}$/.test(k) &&
                  typeof v === "string" &&
                  v.length <= 16,
              )
              .slice(0, 12),
          ) as Record<string, string>,
        );
    } catch {}
  }, [aliasKey]);
  useEffect(() => {
    setAlias(aliases[value] ?? "");
  }, [value, aliases]);
  function saveAlias() {
    if (!value || !pins.includes(value)) return;
    const next = Object.fromEntries(
      pins.map((id) => [
        id,
        id === value ? alias.trim().slice(0, 16) : (aliases[id] ?? ""),
      ]),
    );
    setAliases(next);
    try {
      localStorage.setItem(aliasKey, JSON.stringify(next));
    } catch {}
  }
  function pin(pageId: string) {
    setPins((current) => {
      const next = current.includes(pageId)
        ? current.filter((x) => x !== pageId)
        : [pageId, ...current].slice(0, 12);
      try {
        localStorage.setItem(pinKey, JSON.stringify(next));
      } catch {}
      return next;
    });
  }
  const fixed = pages.filter((p) => pins.includes(p.id)),
    ordered = useMemo(
      () => [
        ...pages.filter((p) => pins.includes(p.id)),
        ...pages.filter((p) => !pins.includes(p.id)),
      ],
      [pages, pins],
    );
  const selected = pages.find((p) => p.id === value);
  const [query, setQuery] = useState(selected?.name ?? ""),
    [open, setOpen] = useState(false),
    [expanded, setExpanded] = useState(false),
    [limit, setLimit] = useState(100),
    [position, setPosition] = useState({ left: 8, top: 8, width: 300 });
  useEffect(() => {
    setQuery(selected?.name ?? "");
  }, [value, selected?.name]);
  const filtered = useMemo(() => {
    const words = query
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase()
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    return ordered.filter((p) => {
      const text = (p.name + " " + p.id)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLocaleLowerCase();
      return words.every((w) => text.includes(w));
    });
  }, [ordered, query]);
  function choose(page: StudioPage) {
    onChange(page.id);
    setQuery(page.name);
    setOpen(false);
    dialog.current?.close();
    skipFocus.current = true;
    input.current?.focus();
  }
  function show() {
    const r = input.current!.getBoundingClientRect();
    setPosition({
      left: Math.max(8, Math.min(r.left, innerWidth - 300)),
      top: Math.max(8, Math.min(r.bottom + 4, innerHeight - 330)),
      width: Math.min(Math.max(r.width, 300), innerWidth - 16),
    });
    setQuery("");
    setLimit(100);
    setOpen(true);
  }
  function rows(modal = false) {
    return (
      <>
        <div
          role="listbox"
          id={id + (modal ? "-modal" : "-inline")}
          aria-label="Páginas disponibles"
          className="studio-page-results"
        >
          {filtered.slice(0, limit).map((page) => (
            <button
              key={page.id}
              type="button"
              role="option"
              aria-selected={page.id === value}
              onClick={() => choose(page)}
            >
              <PageLogo page={page} />
              <span>
                <strong>{page.name}</strong>
                <small>
                  {pins.includes(page.id) ? "★ Fijada · " : ""}
                  {page.id}
                </small>
              </span>
              {page.id === value && <span aria-hidden="true">✓</span>}
            </button>
          ))}
          {!filtered.length && (
            <p role="status">No hay páginas que coincidan.</p>
          )}
        </div>
        {filtered.length > limit && (
          <button type="button" onClick={() => setLimit((n) => n + 100)}>
            Mostrar más páginas
          </button>
        )}
      </>
    );
  }
  return (
    <div
      className="studio-page-picker"
      ref={root}
      onBlur={(e) => {
        if (!root.current?.contains(e.relatedTarget)) {
          setOpen(false);
          setQuery(selected?.name ?? "");
        }
      }}
    >
      <div className="studio-page-label">
        <label htmlFor={id + "-input"}>Página de Facebook</label>
        <button
          type="button"
          disabled={!selected || disabled}
          aria-label={
            selected && pins.includes(selected.id)
              ? "Desfijar página seleccionada"
              : "Fijar página seleccionada"
          }
          title="Fijar o quitar página de tus accesos rápidos"
          aria-pressed={!!selected && pins.includes(selected.id)}
          onClick={() => selected && pin(selected.id)}
        >
          ★
        </button>
        <button
          type="button"
          disabled={disabled || loading || refreshDisabled}
          aria-label="Actualizar páginas de Facebook"
          title="Volver a consultar Meta"
          onClick={onRefresh}
        >
          ↻
        </button>
        <button
          type="button"
          aria-label="Ampliar buscador de páginas"
          title="Ampliar buscador de páginas"
          disabled={disabled || loading}
          onClick={() => {
            setOpen(false);
            setQuery("");
            setLimit(100);
            dialog.current?.showModal();
          }}
        >
          ⛶
        </button>
      </div>
      {!!fixed.length && (
        <div className="studio-fixed-pages" aria-label="Páginas fijadas">
          {fixed.map((page) => (
            <div key={page.id}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => choose(page)}
                title={page.name}
              >
                <PageLogo page={page} />
                <span>{aliases[page.id] || page.name}</span>
              </button>
              <button
                type="button"
                disabled={disabled}
                aria-label={"Desfijar " + page.name}
                onClick={() => pin(page.id)}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      {pins.includes(value) && (
        <details className="studio-page-alias">
          <summary>Nombre corto de esta fijación</summary>
          <label>
            Solo para ti
            <input
              aria-label="Nombre corto de página fijada"
              maxLength={16}
              value={alias}
              placeholder={aliases[value] || "Ej. PE, UY"}
              onChange={(e) => setAlias(e.target.value)}
            />
          </label>
          <button type="button" disabled={disabled} onClick={saveAlias}>
            Guardar nombre
          </button>
        </details>
      )}
      <input
        ref={input}
        id={id + "-input"}
        aria-label="Buscar página de Facebook"
        role="combobox"
        aria-expanded={open}
        aria-controls={open ? id + "-inline" : undefined}
        autoComplete="off"
        disabled={disabled || loading}
        value={query}
        placeholder={
          loading ? "Consultando páginas…" : "Escribe para buscar una página…"
        }
        onFocus={() => {
          if (skipFocus.current) {
            skipFocus.current = false;
            return;
          }
          show();
        }}
        onClick={() => {
          if (!open) show();
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setLimit(100);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            setOpen(false);
            setQuery(selected?.name ?? "");
          }
          if (e.key === "Enter" && open && filtered[0]) {
            e.preventDefault();
            choose(filtered[0]);
          }
        }}
      />
      {open && (
        <div
          className="studio-page-dropdown"
          style={{ position: "fixed", ...position }}
        >
          {rows()}
        </div>
      )}
      <dialog
        ref={dialog}
        className="trial-dialog studio-page-dialog"
        data-expanded={expanded || undefined}
        aria-label="Buscar y seleccionar página de Facebook"
        onClose={() => {
          setExpanded(false);
          setQuery(selected?.name ?? "");
        }}
      >
        <header>
          <h2>Páginas de Facebook</h2>
          <button
            type="button"
            aria-label={
              expanded
                ? "Restaurar buscador de páginas"
                : "Maximizar buscador de páginas"
            }
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? "↙ Restaurar" : "⛶ Maximizar"}
          </button>
          <button
            type="button"
            className="ui-close-button"
            aria-label="Cerrar buscador de páginas"
            onClick={() => dialog.current?.close()}
          >
            ×
          </button>
        </header>
        <input
          aria-label="Buscar página en vista ampliada"
          autoFocus
          value={query}
          placeholder="Buscar por nombre…"
          onChange={(e) => {
            setQuery(e.target.value);
            setLimit(100);
          }}
        />
        {rows(true)}
      </dialog>
    </div>
  );
}
