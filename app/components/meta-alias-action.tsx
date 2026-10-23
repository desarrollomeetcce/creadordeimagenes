"use client";
import { useId, useRef, useState } from "react";
import type { MetaAliasOption } from "./meta-alias-directory";
export function MetaAliasAction({
  name,
  value,
  aliases,
  disabled = false,
  readOnly = false,
  bulkCount,
  onAssign,
}: {
  name: string;
  value?: string | null;
  aliases: MetaAliasOption[];
  disabled?: boolean;
  readOnly?: boolean;
  bulkCount?: number;
  onAssign: (id: string | null) => void;
}) {
  const id = useId(),
    popover = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const bulk = bulkCount !== undefined;
  const label = bulk ? "Asignar alias" : value ? "Con alias" : "Sin alias";
  if (readOnly) return <span className="meta-alias-indicator">{label}</span>;
  const assign = (aliasId: string | null) => {
    popover.current?.hidePopover();
    onAssign(aliasId);
  };
  return (
    <>
      <button
        type="button"
        className={bulk ? "meta-bulk-alias" : "meta-inline-alias"}
        disabled={disabled || (bulk && !bulkCount)}
        popoverTarget={id}
        aria-label={
          bulk
            ? `Asignar alias a ${bulkCount} seleccionados`
            : `${label} de ${name}`
        }
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setPosition({
            left: Math.max(8, Math.min(r.left, window.innerWidth - 280)),
            top: Math.max(8, Math.min(r.bottom + 5, window.innerHeight - 205)),
          });
        }}
      >
        {label}
        {bulk ? ` (${bulkCount})` : " ▾"}
      </button>
      <div
        id={id}
        ref={popover}
        popover="auto"
        className="meta-alias-popover"
        style={{ top: position.top, left: position.left }}
      >
        <label>
          {bulk ? `Asignar a ${bulkCount} seleccionados` : "Alias"}
          <select
            aria-label={bulk ? "Alias para seleccionados" : `Alias de ${name}`}
            value={bulk ? "__choose" : (value ?? "")}
            disabled={disabled}
            onChange={(e) => assign(e.target.value || null)}
          >
            {bulk ? (
              <option value="__choose" disabled>
                Elige un alias
              </option>
            ) : (
              <option value="">Sin alias</option>
            )}
            {aliases.map((a) => (
              <option value={a.id} key={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        {!aliases.length && (
          <p className="hint">Crea los alias en «Alias de diplomados».</p>
        )}
        {bulk && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => assign(null)}
          >
            Quitar alias de la selección
          </button>
        )}
      </div>
    </>
  );
}
