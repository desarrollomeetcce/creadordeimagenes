"use client";
import { SheetSearchSelect } from "./sheet-search-select";
import { useId, useMemo, useRef, useState } from "react";
import { categoryKey } from "../../lib/meta-ads/category-paste";
import { currencyCodes } from "../../lib/meta-ads/currency-codes";
import type { MetaInventorySelection } from "../../lib/meta-ads/aliases";
import { countryName, countryOptions } from "../../lib/meta-ads/countries";
import type {
  MetaAliasOption,
  MetaCatalogOption,
} from "./meta-alias-directory";
export function MetaAliasAction({
  name,
  value,
  country,
  aliases,
  catalog = [],
  advisors = [],
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
  catalog?: MetaCatalogOption[];
  advisors?: { id: string; name: string; sheet?: { name: string } }[];
  tables?: { id: string; name: string; defaultCurrency?: string }[];
  inventories?: { id: string; name: string }[];
  disabled?: boolean;
  readOnly?: boolean;
  bulkCount?: number;
  onAssign: (
    id: string | null,
    country: string | null,
    selection?: MetaInventorySelection,
    details?: { advisorId?: string; currency?: string },
  ) => void;
}) {
  const id = useId(),
    popover = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 }),
    [draftAlias, setDraftAlias] = useState(""),
    [draftCountry, setDraftCountry] = useState(""),
    [draftList, setDraftList] = useState(""),
    [draftTable, setDraftTable] = useState("");
  const [open, setOpen] = useState(false),
    [customName, setCustomName] = useState("");
  const [draftAdvisor, setDraftAdvisor] = useState(""),
    [draftCurrency, setDraftCurrency] = useState("");
  const details = {
    ...(draftAdvisor ? { advisorId: draftAdvisor } : {}),
    ...(draftCurrency ? { currency: draftCurrency } : {}),
  };
  const options = useMemo(() => {
    if (!open) return [];
    const inTable = aliases.filter(
      (a) => (a.tableId ?? "diplomados") === draftTable && !a.detached,
    );
    const names = new Set(inTable.map((a) => categoryKey(a.name)));
    return [
      { value: "", label: "Elige un elemento del inventario" },
      ...inTable
        .filter((a) => !draftList || a.inventorySheetId === draftList)
        .map((a) => ({ value: a.id, label: a.name, group: "En esta tabla" })),
      ...catalog
        .filter(
          (c) =>
            (!draftList || c.inventorySheetId === draftList) &&
            !names.has(categoryKey(c.name)),
        )
        .map((c) => ({
          value: c.catalogId,
          label: c.name,
          searchLabel: c.name + " " + c.inventorySheetName,
          group: "Fuera de la tabla · Inventario completo",
        })),
      ...(customName
        ? [
            {
              value: "new:" + customName,
              label: customName,
              group: "Nuevo diplomado",
            },
          ]
        : []),
    ];
  }, [open, aliases, catalog, draftTable, draftList, customName]);
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
        ? `Con inventario${country ? ` · ${country}` : ""}`
        : "Sin inventario";
  if (readOnly)
    return (
      <span className="meta-alias-indicator" title={countryName(country)}>
        {label}
      </span>
    );
  const assign = (aliasId: string | null, code: string | null) => {
    popover.current?.hidePopover();
    onAssign(aliasId, code, undefined, aliasId ? details : undefined);
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
          setCustomName("");
          setDraftAdvisor("");
          setDraftCurrency(
            providedTables?.find(
              (t) => t.id === aliases.find((a) => a.id === value)?.tableId,
            )?.defaultCurrency ?? "",
          );
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
        onToggle={(e) => setOpen(e.newState === "open")}
        className="meta-alias-popover"
        style={{
          ...position,
          maxHeight: `calc(100dvh - ${position.top + 8}px)`,
        }}
      >
        <header className="meta-alias-context">
          <small>{bulk ? "Asignación masiva" : "Asignando inventario a"}</small>
          <strong>
            {bulk ? `${bulkCount} elementos seleccionados` : name}
          </strong>
        </header>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const item = catalog.find((c) => c.catalogId === draftAlias);
            if (item || (customName && draftAlias === "new:" + customName)) {
              popover.current?.hidePopover();
              onAssign(
                null,
                draftCountry,
                {
                  tableId: draftTable,
                  ...(item
                    ? {
                        catalogId: item.catalogId,
                        inventorySheetId: item.inventorySheetId,
                      }
                    : {
                        name: customName,
                        ...(draftList ? { inventorySheetId: draftList } : {}),
                      }),
                },
                details,
              );
            } else assign(draftAlias || null, draftAlias ? draftCountry : null);
          }}
        >
          <label>
            Lista de inventario
            <SheetSearchSelect
              label="Lista de inventario"
              placeholder="Todas las listas"
              value={draftList}
              options={[
                { value: "", label: "Todas las listas" },
                ...inventories.map((t) => ({ value: t.id, label: t.name })),
              ]}
              onSelect={(v) => {
                setDraftList(v);
                setDraftTable("");
                setDraftAlias("");
                setDraftCountry("");
                setCustomName("");
              }}
            />
          </label>
          <label>
            Tabla
            <SheetSearchSelect
              label="Tabla de inventario"
              placeholder="Elige una tabla"
              value={draftTable}
              disabled={disabled}
              options={[
                { value: "", label: "Elige una tabla" },
                ...tables.map((t) => ({ value: t.id, label: t.name })),
              ]}
              onSelect={(v) => {
                setDraftTable(v);
                setDraftCurrency(
                  providedTables?.find((t) => t.id === v)?.defaultCurrency ??
                    "",
                );
                setDraftAlias("");
                setDraftCountry("");
                setCustomName("");
              }}
            />
          </label>
          <label>
            {bulk ? `Inventario para ${bulkCount} seleccionados` : "Inventario"}
            <SheetSearchSelect
              label={
                bulk ? "Inventario para seleccionados" : `Inventario de ${name}`
              }
              placeholder="Elige un elemento del inventario"
              value={draftAlias}
              disabled={disabled || !draftTable}
              options={options}
              onCreate={(name) => {
                setCustomName(name);
                setDraftAlias("new:" + name);
              }}
              createLabel="Añadir nuevo a esta tabla"
              createOnEnter
              onSelect={(v) => {
                setDraftAlias(v);
                if (!v) setDraftCountry("");
              }}
            />
          </label>
          <label>
            País
            <SheetSearchSelect
              label="País del inventario"
              placeholder="Selecciona un país"
              value={draftCountry}
              disabled={disabled || !draftAlias}
              options={[
                { value: "", label: "Selecciona un país" },
                ...countryOptions.map((c) => ({
                  value: c.code,
                  label: `${c.code} · ${c.name}`,
                })),
              ]}
              onSelect={setDraftCountry}
            />
          </label>
          <div className="meta-alias-details-row">
            <label>
              Asesor
              <SheetSearchSelect
                label="Asesor del inventario"
                value={draftAdvisor}
                placeholder="Conservar / sin asesor"
                disabled={disabled || !draftAlias}
                options={[
                  { value: "", label: "Conservar / sin asesor" },
                  ...advisors.map((a) => ({
                    value: a.id,
                    label: a.name + (a.sheet ? " · " + a.sheet.name : ""),
                  })),
                ]}
                onSelect={setDraftAdvisor}
              />
            </label>
            <label>
              Moneda
              <SheetSearchSelect
                label="Moneda del inventario"
                value={draftCurrency}
                placeholder="Conservar / sin moneda"
                disabled={disabled || !draftAlias}
                options={[
                  { value: "", label: "Conservar / sin moneda" },
                  ...currencyCodes.map((value) => ({ value, label: value })),
                ]}
                onSelect={setDraftCurrency}
              />
            </label>
          </div>
          <small>
            Inventario y país vinculan la base y el gasto con Efectividad. Las
            ventas por asesor se registran en V de cada hoja. No cambia la
            segmentación en Meta.
          </small>
          {draftAlias && !aliases.some((a) => a.id === draftAlias) && (
            <small className="meta-alias-add-hint">
              Se añadirá sin duplicados, con su estado registrado en Meta. Si
              faltan datos, aparecerá en «Por asignar».
            </small>
          )}
          {!aliases.length && !catalog.length && (
            <p className="hint">Crea los nombres en «Efectividad».</p>
          )}
          <div className="row">
            <button
              type="submit"
              className="primary"
              disabled={disabled || !draftTable || !draftAlias || !draftCountry}
            >
              Guardar inventario y país
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
