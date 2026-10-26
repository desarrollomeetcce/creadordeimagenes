"use client";
import { useId, useRef, useState } from "react";
import { countryName, countryOptions } from "../../lib/meta-ads/countries";
import type { MetaAliasOption } from "./meta-alias-directory";
export function MetaAliasAction({
  name,
  value,
  country,
  advisorId,
  advisors,
  aliases,
  tables: providedTables,
  inventories: providedInventories,
  disabled = false,
  readOnly = false,
  bulkCount,
  onAssign,
}: {
  name: string;
  value?: string | null;
  country?: string | null;
  aliases: MetaAliasOption[];
  advisorId?: string | null;
  advisors: { id: string; name: string; label?: string }[];
  tables?: { id: string; name: string }[];
  inventories?: { id: string; name: string }[];
  disabled?: boolean;
  readOnly?: boolean;
  bulkCount?: number;
  onAssign: (
    id: string | null,
    country: string | null,
    advisorId: string | null,
  ) => void;
}) {
  const id = useId(),
    popover = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 }),
    [draftAlias, setDraftAlias] = useState(""),
    [draftCountry, setDraftCountry] = useState(""),
    [draftAdvisor, setDraftAdvisor] = useState(""),
    [draftList, setDraftList] = useState(""),
    [draftTable, setDraftTable] = useState("");
  const tables = providedTables ?? [
    ...new Map(
      aliases.map((a) => [
        a.tableId ?? "diplomados",
        { id: a.tableId ?? "diplomados", name: a.table?.name ?? "Diplomados" },
      ]),
    ).values(),
  ];
  const inventories = providedInventories ?? [
    ...new Map(
      aliases.map((a) => [
        a.inventorySheetId ?? "default-inventory",
        {
          id: a.inventorySheetId ?? "default-inventory",
          name: a.inventorySheet?.name ?? "Inventario",
        },
      ]),
    ).values(),
  ];
  const bulk = bulkCount !== undefined,
    label = bulk
      ? "Asignar inventario"
      : value
        ? `Con inventario${country ? ` · ${country}` : ""} · ${advisors.find((a) => a.id === advisorId)?.name ?? "Sin asesor"}`
        : "Sin inventario";
  if (readOnly)
    return (
      <span className="meta-alias-indicator" title={countryName(country)}>
        {label}
      </span>
    );
  const assign = (aliasId: string | null, code: string | null) => {
    popover.current?.hidePopover();
    onAssign(aliasId, code, aliasId ? draftAdvisor || null : null);
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
            ? `${aliases.find((a) => a.id === value)?.name ?? "Inventario"} · ${countryName(country)}`
            : undefined
        }
        aria-label={
          bulk
            ? `Asignar inventario a ${bulkCount} seleccionados`
            : `${label} de ${name}`
        }
        onClick={(e) => {
          const currentList =
            aliases.find((a) => a.id === value)?.inventorySheetId ??
            "default-inventory";
          setDraftList(
            bulk || !value || !inventories.some((i) => i.id === currentList)
              ? ""
              : currentList,
          );
          setDraftAlias(bulk ? "" : (value ?? ""));
          setDraftTable(
            bulk || !value
              ? ""
              : (aliases.find((a) => a.id === value)?.tableId ?? "diplomados"),
          );
          setDraftCountry(bulk ? "" : (country ?? ""));
          setDraftAdvisor(bulk ? "" : (advisorId ?? ""));
          const r = e.currentTarget.getBoundingClientRect();
          setPosition({
            left: Math.max(8, Math.min(r.left, window.innerWidth - 280)),
            top: Math.max(8, Math.min(r.bottom + 5, window.innerHeight - 420)),
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
        style={{
          ...position,
          maxHeight: `calc(100dvh - ${position.top + 8}px)`,
        }}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            assign(draftAlias || null, draftAlias ? draftCountry : null);
          }}
        >
          <label>
            Lista de inventario
            <select
              aria-label="Lista de inventario"
              value={draftList}
              onChange={(e) => {
                setDraftList(e.target.value);
                setDraftTable("");
                setDraftAlias("");
              }}
            >
              <option value="">Todas las listas</option>
              {inventories.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Tabla
            <select
              aria-label="Tabla de inventario"
              value={draftTable}
              disabled={disabled}
              onChange={(e) => {
                setDraftTable(e.target.value);
                setDraftAlias("");
              }}
            >
              <option value="">Elige una tabla</option>
              {tables.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {bulk ? `Inventario para ${bulkCount} seleccionados` : "Inventario"}
            <select
              aria-label={
                bulk ? "Inventario para seleccionados" : `Inventario de ${name}`
              }
              value={draftAlias}
              disabled={disabled || !draftTable}
              onChange={(e) => {
                setDraftAlias(e.target.value);
                if (!e.target.value) setDraftCountry("");
              }}
            >
              <option value="">{"Elige un elemento del inventario"}</option>
              {aliases
                .filter(
                  (a) =>
                    (a.tableId ?? "diplomados") === draftTable &&
                    (!draftList ||
                      (a.inventorySheetId ?? "default-inventory") ===
                        draftList),
                )
                .map((a) => (
                  <option value={a.id} key={a.id}>
                    {a.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            País
            <select
              aria-label="País del inventario"
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
          <label>
            Asesor
            <select
              aria-label="Asesor del inventario"
              value={draftAdvisor}
              required={!!draftAlias}
              disabled={disabled || !draftAlias}
              onChange={(e) => setDraftAdvisor(e.target.value)}
            >
              <option value="">Selecciona un asesor</option>
              {advisors.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label ?? a.name}
                </option>
              ))}
            </select>
          </label>
          <small>
            Inventario, país y asesor deben coincidir exactamente con
            Efectividad. Crea los asesores en la hoja «Asesores». No cambia la
            segmentación en Meta.
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
                !draftTable ||
                !draftAlias ||
                !draftCountry ||
                !draftAdvisor
              }
            >
              Guardar inventario, país y asesor
            </button>
            <button
              type="button"
              onClick={() => popover.current?.hidePopover()}
            >
              Cancelar
            </button>
          </div>
        </form>
        {!bulk && !!value && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => assign(null, null)}
          >
            Quitar inventario de esta fila
          </button>
        )}
        {bulk && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => assign(null, null)}
          >
            Quitar inventario de la selección
          </button>
        )}
      </div>
    </>
  );
}
