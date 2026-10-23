"use client";
import { useId, useRef, useState } from "react";
import { countryName, countryOptions } from "../../lib/meta-ads/countries";
import type { MetaAliasOption } from "./meta-alias-directory";
export function MetaAliasAction({
  name,
  value,
  country,
  aliases,
  disabled = false,
  readOnly = false,
  bulkCount,
  onAssign,
}: {
  name: string;
  value?: string | null;
  country?: string | null;
  aliases: MetaAliasOption[];
  disabled?: boolean;
  readOnly?: boolean;
  bulkCount?: number;
  onAssign: (id: string | null, country: string | null) => void;
}) {
  const id = useId(),
    popover = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 }),
    [draftAlias, setDraftAlias] = useState(""),
    [draftCountry, setDraftCountry] = useState("");
  const bulk = bulkCount !== undefined,
    label = bulk
      ? "Asignar alias"
      : value
        ? `Con alias${country ? ` · ${country}` : ""}`
        : "Sin alias";
  if (readOnly)
    return (
      <span className="meta-alias-indicator" title={countryName(country)}>
        {label}
      </span>
    );
  const assign = (aliasId: string | null, code: string | null) => {
    popover.current?.hidePopover();
    onAssign(aliasId, code);
  };
  return (
    <>
      <button
        type="button"
        className={bulk ? "meta-bulk-alias" : "meta-inline-alias"}
        disabled={disabled || (bulk && !bulkCount)}
        popoverTarget={id}
        title={
          value
            ? `${aliases.find((a) => a.id === value)?.name ?? "Alias"} · ${countryName(country)}`
            : undefined
        }
        aria-label={
          bulk
            ? `Asignar alias a ${bulkCount} seleccionados`
            : `${label} de ${name}`
        }
        onClick={(e) => {
          setDraftAlias(bulk ? "" : (value ?? ""));
          setDraftCountry(bulk ? "" : (country ?? ""));
          const r = e.currentTarget.getBoundingClientRect();
          setPosition({
            left: Math.max(8, Math.min(r.left, window.innerWidth - 280)),
            top: Math.max(8, Math.min(r.bottom + 5, window.innerHeight - 320)),
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
        style={position}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            assign(draftAlias || null, draftAlias ? draftCountry : null);
          }}
        >
          <label>
            {bulk ? `Alias para ${bulkCount} seleccionados` : "Alias"}
            <select
              aria-label={
                bulk ? "Alias para seleccionados" : `Alias de ${name}`
              }
              value={draftAlias}
              disabled={disabled}
              onChange={(e) => {
                setDraftAlias(e.target.value);
                if (!e.target.value) setDraftCountry("");
              }}
            >
              <option value="">{bulk ? "Elige un alias" : "Sin alias"}</option>
              {aliases.map((a) => (
                <option value={a.id} key={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            País
            <select
              aria-label="País del alias"
              value={draftCountry}
              required={!!draftAlias}
              disabled={disabled || !draftAlias}
              onChange={(e) => setDraftCountry(e.target.value)}
            >
              <option value="">Selecciona un país</option>
              {countryOptions.map((c) => (
                <option value={c.code} key={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <small>
            Alias y país identifican esta fila. No cambian la segmentación en
            Meta.
          </small>
          {!aliases.length && (
            <p className="hint">Crea los nombres en «Efectividad».</p>
          )}
          <div className="row">
            <button
              type="submit"
              className="primary"
              disabled={
                disabled ||
                (bulk && !draftAlias) ||
                (!!draftAlias && !draftCountry)
              }
            >
              Guardar alias y país
            </button>
            <button
              type="button"
              onClick={() => popover.current?.hidePopover()}
            >
              Cancelar
            </button>
          </div>
        </form>
        {bulk && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => assign(null, null)}
          >
            Quitar alias de la selección
          </button>
        )}
      </div>
    </>
  );
}
