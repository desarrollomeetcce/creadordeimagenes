"use client";
import { SheetSearchSelect } from "./sheet-search-select";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { categoryKey } from "../../lib/meta-ads/category-paste";
import { currencyCodes } from "../../lib/meta-ads/currency-codes";
import type {
  AssignmentContext,
  MetaInventorySelection,
} from "../../lib/meta-ads/aliases";
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
  onOpen,
  triggerLabel,
  initialTableId,
  initialListId,
  extraFields,
  extraSaveDisabled = false,
  allowRemove = true,
  lockIdentity = false,
}: {
  triggerLabel?: string;
  initialTableId?: string;
  initialListId?: string;
  extraFields?: ReactNode;
  extraSaveDisabled?: boolean;
  allowRemove?: boolean;
  lockIdentity?: boolean;
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
  onOpen?: () => void;
  onAssign: (
    id: string | null,
    country: string | null,
    selection?: MetaInventorySelection,
    details?: {
      advisorId?: string;
      currency?: string;
      assignmentContext?: AssignmentContext;
    },
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
  const [savedContext, setSavedContext] = useState<
      | (AssignmentContext & {
          advisorId: string | null;
          advisorName: string | null;
          currency: string;
          source?: "row" | "inventory" | null;
          inventoryAdvisors?: { id: string; name: string }[];
        })
      | null
    >(null),
    [contextLoading, setContextLoading] = useState(false),
    [contextError, setContextError] = useState(""),
    [contextReload, setContextReload] = useState(0);
  useEffect(() => {
    setSavedContext(null);
    setContextError("");
    setDraftAdvisor("");
    if (!open || !draftTable || !draftAlias || !draftCountry) {
      setContextLoading(false);
      return;
    }
    const ac = new AbortController(),
      q = new URLSearchParams({ tableId: draftTable, country: draftCountry });
    if (draftAlias.startsWith("item:") || draftAlias.startsWith("alias:"))
      q.set("catalogId", draftAlias);
    else if (draftAlias.startsWith("new:")) q.set("name", draftAlias.slice(4));
    else q.set("aliasId", draftAlias);
    setContextLoading(true);
    setDraftCurrency("");
    void fetch("/api/meta-ads/objects/alias-context?" + q, {
      signal: ac.signal,
      cache: "no-store",
    })
      .then(async (r) => {
        const b = await r.json();
        if (!r.ok)
          throw Error(
            b.error ?? "No se pudieron consultar los datos guardados.",
          );
        return b;
      })
      .then((b) => {
        if (ac.signal.aborted) return;
        setSavedContext(b);
        setDraftAdvisor(b.advisorId ?? "");
        setDraftCurrency(b.currency ?? "");
      })
      .catch((e) => {
        if (!ac.signal.aborted)
          setContextError(
            e instanceof Error
              ? e.message
              : "No se pudieron consultar los datos guardados.",
          );
      })
      .finally(() => {
        if (!ac.signal.aborted) setContextLoading(false);
      });
    return () => ac.abort();
  }, [open, draftTable, draftAlias, draftCountry, contextReload]);
  const details = {
    ...(savedContext
      ? {
          assignmentContext: {
            aliasId: savedContext.aliasId,
            tableId: savedContext.tableId,
            country: savedContext.country,
            revision: savedContext.revision,
            ...(savedContext.inventoryId
              ? {
                  inventoryId: savedContext.inventoryId,
                  advisorRevision: savedContext.advisorRevision,
                }
              : {}),
          },
        }
      : {}),
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
    label =
      triggerLabel ??
      (bulk
        ? "Asignar inventario"
        : value
          ? `Con inventario${country ? ` · ${country}` : ""}`
          : "Sin inventario");
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
            initialListId ??
            "default-inventory";
          setDraftList(
            bulk || !value || !inventories.some((i) => i.id === currentList)
              ? ""
              : currentList,
          );
          setDraftAlias(bulk ? "" : (value ?? ""));
          setDraftTable(
            bulk || !value
              ? (initialTableId ?? "")
              : (aliases.find((a) => a.id === value)?.tableId ??
                  initialTableId ??
                  "diplomados"),
          );
          setDraftCountry(bulk ? "" : (country ?? ""));
          const r = e.currentTarget.getBoundingClientRect();
          setPosition({
            left: Math.max(8, Math.min(r.left, window.innerWidth - 376)),
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
        onToggle={(e) => {
          const next = e.newState === "open";
          setOpen(next);
          if (next) onOpen?.();
        }}
        className="meta-alias-popover"
        style={{
          ...position,
          maxHeight: `calc(100dvh - ${position.top + 8}px)`,
        }}
      >
        <header className="meta-alias-context">
          <small>
            <span aria-hidden="true">⠿</span>{" "}
            {bulk ? "Asignación masiva" : "Asignando inventario a"}
            <span className="meta-alias-drag-hint">Arrastra para mover</span>
          </small>
          <strong>
            {bulk ? `${bulkCount} elementos seleccionados` : name}
          </strong>
        </header>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (extraSaveDisabled) return;
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
          <fieldset disabled={lockIdentity} className="meta-sync-identity">
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
              {bulk
                ? `Inventario para ${bulkCount} seleccionados`
                : "Inventario"}
              <SheetSearchSelect
                label={
                  bulk
                    ? "Inventario para seleccionados"
                    : `Inventario de ${name}`
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
                disabled={
                  disabled || !draftAlias || contextLoading || !!contextError
                }
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
          </fieldset>
          <div className="meta-alias-details-row">
            <label>
              Asesor
              <SheetSearchSelect
                label="Asesor del inventario"
                value={draftAdvisor}
                placeholder="Conservar / sin asesor"
                disabled={
                  disabled || !draftAlias || contextLoading || !!contextError
                }
                options={[
                  { value: "", label: "Conservar / sin asesor" },
                  ...(savedContext?.advisorId &&
                  !advisors.some((a) => a.id === savedContext.advisorId)
                    ? [
                        {
                          value: savedContext.advisorId,
                          label: savedContext.advisorName ?? "Asesor actual",
                        },
                      ]
                    : []),
                  ...advisors.map((a) => ({
                    value: a.id,
                    label: a.name + (a.sheet ? " · " + a.sheet.name : ""),
                  })),
                ]}
                onSelect={(id) => {
                  if (
                    id &&
                    savedContext?.advisorId &&
                    id !== savedContext.advisorId &&
                    !confirm(
                      savedContext.source === "inventory"
                        ? `El inventario tiene asignado a ${savedContext.advisorName}. ¿Deseas vincular con otro asesor para esta hoja y país?`
                        : `El asesor guardado es ${savedContext.advisorName ?? "otro asesor"}. ¿Deseas proponer cambiarlo? Se conservará el titular actual y la diferencia quedará por revisar en la hoja.`,
                    )
                  )
                    return;
                  setDraftAdvisor(id);
                }}
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
          {contextLoading && (
            <small role="status">Consultando asesor y moneda guardados…</small>
          )}
          {contextError && (
            <p role="alert">
              {contextError}{" "}
              <button
                type="button"
                onClick={() => setContextReload((v) => v + 1)}
              >
                Reintentar datos guardados
              </button>
            </p>
          )}
          {savedContext?.advisorId && (
            <small>
              Asesor{" "}
              {savedContext.source === "inventory"
                ? "del inventario"
                : "guardado"}
              : {savedContext.advisorName}.{" "}
              {draftAdvisor && draftAdvisor !== savedContext.advisorId
                ? savedContext.source === "inventory"
                  ? "Se usará el asesor seleccionado para esta hoja."
                  : "El cambio quedará por revisar en la hoja."
                : "Se conservará al vincular."}
            </small>
          )}
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
          {extraFields}
          <div className="row">
            <button
              type="submit"
              className="primary"
              disabled={
                disabled ||
                extraSaveDisabled ||
                !draftTable ||
                !draftAlias ||
                !draftCountry ||
                contextLoading ||
                !!contextError
              }
            >
              {triggerLabel
                ? "Guardar sincronización"
                : "Guardar inventario y país"}
            </button>
            <button
              type="button"
              onClick={() => popover.current?.hidePopover()}
            >
              Cancelar
            </button>
          </div>
        </form>
        {allowRemove && !bulk && !!value && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => assign(null, null)}
          >
            Quitar inventario de esta fila
          </button>
        )}
        {allowRemove && bulk && (
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
