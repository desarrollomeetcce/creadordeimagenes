"use client";
import { useId, useRef, useState } from "react";
export type SearchOption = {
  id: string;
  label: string;
  detail?: string;
  group?: string;
  search?: string;
};
export function SearchSelect({
  label,
  value,
  onChange,
  onSelect,
  options,
  name,
  required,
  disabled,
  loading,
  hasMore,
  browseOnToggle = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onSelect: (option: SearchOption) => void;
  options: SearchOption[];
  name?: string;
  required?: boolean;
  disabled?: boolean;
  loading?: boolean;
  hasMore?: boolean;
  browseOnToggle?: boolean;
}) {
  const id = useId(),
    input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false),
    [browsing, setBrowsing] = useState(false),
    [active, setActive] = useState(-1),
    [collapsed, setCollapsed] = useState<string[]>([]);
  const normalized =
    browsing && browseOnToggle ? "" : value.trim().toLocaleLowerCase();
  const filtered = options.filter((o) =>
    `${o.label} ${o.detail ?? ""} ${o.group ?? ""} ${o.search ?? ""}`
      .toLocaleLowerCase()
      .includes(normalized),
  );
  const groups = [...new Set(filtered.map((o) => o.group ?? ""))];
  const visible = filtered.filter(
    (o) => normalized || !collapsed.includes(o.group ?? ""),
  );
  const choose = (option: SearchOption) => {
    onSelect(option);
    setOpen(false);
    setBrowsing(false);
    setActive(-1);
    input.current?.focus();
  };
  return (
    <div
      className="search-select"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
    >
      <label htmlFor={id}>{label}</label>
      <div className="search-select-input">
        <input
          id={id}
          ref={input}
          name={name}
          value={value}
          required={required}
          disabled={disabled}
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={open ? id + "-list" : undefined}
          aria-activedescendant={
            open && active >= 0 && visible[active]
              ? id + "-option-" + visible[active].id
              : undefined
          }
          onChange={(e) => {
            setBrowsing(false);
            onChange(e.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setOpen(false);
              return;
            }
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              setOpen(true);
              setActive((current) =>
                Math.max(
                  0,
                  Math.min(
                    visible.length - 1,
                    current + (e.key === "ArrowDown" ? 1 : -1),
                  ),
                ),
              );
            }
            if (e.key === "Enter" && open && active >= 0 && visible[active]) {
              e.preventDefault();
              choose(visible[active]);
            }
          }}
        />
        <button
          type="button"
          disabled={disabled}
          aria-label={"Desplegar " + label.toLowerCase()}
          aria-expanded={open}
          onClick={() => {
            input.current?.focus();
            setBrowsing(!open);
            setOpen(!open);
            setActive(-1);
          }}
        >
          ▾
        </button>
      </div>
      {open && (
        <div
          id={id + "-list"}
          role="listbox"
          aria-label={label}
          className="search-select-options"
        >
          {loading ? (
            <p role="status">Buscando…</p>
          ) : (
            <>
              {!filtered.length && (
                <p role="status">
                  No existe
                  {value.trim()
                    ? `: ${value.trim()}`
                    : " una opción disponible"}
                  .
                </p>
              )}
              {groups.map((group) => (
                <div key={group} role="group" aria-label={group || label}>
                  {group && (
                    <button
                      type="button"
                      className="search-select-group"
                      aria-expanded={!!normalized || !collapsed.includes(group)}
                      onClick={() =>
                        setCollapsed((c) =>
                          c.includes(group)
                            ? c.filter((g) => g !== group)
                            : [...c, group],
                        )
                      }
                    >
                      {normalized || !collapsed.includes(group) ? "▾" : "▸"}{" "}
                      {group}
                    </button>
                  )}
                  {(normalized || !collapsed.includes(group)) &&
                    filtered
                      .filter((o) => (o.group ?? "") === group)
                      .map((option) => (
                        <button
                          type="button"
                          role="option"
                          aria-selected={visible[active]?.id === option.id}
                          id={id + "-option-" + option.id}
                          key={option.id}
                          className={
                            "search-select-option" + (group ? " indented" : "")
                          }
                          onClick={() => choose(option)}
                        >
                          <strong>{option.label}</strong>
                          {option.detail && <small>{option.detail}</small>}
                        </button>
                      ))}
                </div>
              ))}
              {hasMore && (
                <p>
                  Hay más resultados. Escribe el nombre o correo para precisar
                  la búsqueda.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
