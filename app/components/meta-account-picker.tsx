"use client";
import { useId, useState } from "react";
import {
  matchesAccount,
  activityOptions,
  accountActivityText,
  type SearchableAccount,
} from "../../lib/meta-ads/account-filters";
export function MetaAccountPicker({
  accounts,
  selected,
  business,
  onChange,
}: {
  accounts: SearchableAccount[];
  selected: string[];
  business: string;
  onChange: (ids: string[]) => void;
}) {
  const id = useId(),
    [open, setOpen] = useState(false),
    [query, setQuery] = useState(""),
    [activity, setActivity] = useState("all");
  const visible = accounts.filter((a) =>
    matchesAccount(a, query, activity, business),
  );
  const selection = new Set(selected);
  const name =
    selected.length === 1
      ? (accounts.find((a) => selection.has(a.id))?.name ?? "1 seleccionada")
      : selected.length
        ? `${selected.length} seleccionadas`
        : "Todas las autorizadas";
  return (
    <div className="meta-filter-field">
      <span id={id}>Cuentas publicitarias</span>
      <details
        className="meta-account-picker"
        onToggle={(e) => setOpen(e.currentTarget.open)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.currentTarget.open = false;
            e.currentTarget.querySelector("summary")?.focus();
          }
        }}
      >
        <summary aria-labelledby={`${id} ${id}-value`}>
          <span id={`${id}-value`} title={name}>
            {name}
          </span>
        </summary>
        {open && (
          <div className="stack">
            <label>
              Buscar cuenta por nombre o ID
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Nombre, negocio o act_…"
              />
            </label>
            <label>
              Actividad de cuentas
              <select
                value={activity}
                onChange={(e) => setActivity(e.target.value)}
              >
                {activityOptions.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <small role="status">
              {visible.length} coinciden · {selected.length} seleccionadas
            </small>
            <div className="meta-account-options">
              {visible.map((a) => (
                <label className="check" key={a.id}>
                  <input
                    type="checkbox"
                    checked={selection.has(a.id)}
                    onChange={(e) =>
                      onChange(
                        e.target.checked
                          ? [...selected, a.id]
                          : selected.filter((id) => id !== a.id),
                      )
                    }
                  />
                  <span>
                    {a.name}
                    <small>
                      act_{a.id} · {a.currency}
                    </small>
                    <small>{accountActivityText(a)}</small>
                  </span>
                </label>
              ))}
            </div>
            {!visible.length && (
              <p>
                No hay cuentas que coincidan. Las no sincronizadas tienen
                actividad desconocida.
              </p>
            )}
            <button type="button" onClick={() => onChange([])}>
              Todas las autorizadas
            </button>
            <small>
              Buscar no cambia tu selección. Los filtros de actividad usan la
              última importación completa de hoy; no consultan Meta.
            </small>
          </div>
        )}
      </details>
    </div>
  );
}
