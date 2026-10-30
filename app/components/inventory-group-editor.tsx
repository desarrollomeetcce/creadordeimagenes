"use client";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { financialRequest as api } from "./financial-request";
import { InventoryMultiSelect } from "./inventory-multi-select";
import { SheetSearchSelect } from "./sheet-search-select";
import { matchesSearchWords } from "../../lib/search";
import { categoryKey } from "../../lib/meta-ads/category-paste";
import {
  diverseTrialItems,
  type TrialItem,
} from "../../lib/meta-ads/inventory-trial-policy";
import type {
  TrialDirectory,
  TrialGroup,
} from "../../lib/meta-ads/inventory-trials";
import { limaToday } from "./date-range";
import { countryOptions } from "../../lib/meta-ads/countries";

export function InventoryGroupEditor({
  directory,
  group,
  initialNames,
  onClose,
  onSaved,
  topContent,
  initialTab,
  onChooseGroup,
  externalBusy = false,
}: {
  externalBusy?: boolean;
  topContent?: ReactNode;
  initialTab?: "create" | "edit" | "top";
  onChooseGroup?: (id: string) => void;
  directory: TrialDirectory;
  group?: TrialGroup;
  initialNames: string[];
  onClose: () => void;
  onSaved: (id: string) => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [managementTab, setManagementTab] = useState<"create" | "edit" | "top">(
    initialTab ?? (group ? "edit" : "create"),
  );
  const [requestId] = useState(() => crypto.randomUUID());
  const [name, setName] = useState(
    group?.name ?? "Grupo " + (directory.groups.length + 1),
  );
  const [ids, setIds] = useState(() => [
    ...new Set([
      ...(group?.members.map((m) => m.itemId) ?? []),
      ...directory.catalog
        .filter((i) =>
          initialNames.some((n) => categoryKey(n) === categoryKey(i.name)),
        )
        .map((i) => i.id),
    ]),
  ]);
  const [countries, setCountries] = useState(
    group?.countries ??
      (directory.groups.length
        ? [...new Set(directory.groups.flatMap((g) => g.countries))].slice(
            0,
            20,
          )
        : ["PE", "EC", "BO", "CO"]),
  );
  const [query, setQuery] = useState(""),
    [primary, setPrimary] = useState<string[]>([]),
    [secondary, setSecondary] = useState<string[]>([]),
    [sheets, setSheets] = useState<string[]>([]);
  const [count, setCount] = useState(10),
    [onlySelected, setOnlySelected] = useState(false),
    [replacing, setReplacing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [committed, setCommitted] = useState(false);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const catalog = directory.catalog;
  const occupied = new Map(
    directory.groups
      .filter((g) => g.id !== group?.id)
      .flatMap((g) =>
        g.members.map(
          (m) =>
            [
              categoryKey(
                directory.catalog.find((i) => i.id === m.itemId)?.name ??
                  m.name,
              ),
              g.name,
            ] as const,
        ),
      ),
  );
  const primaryOptions = [
    ...new Set(catalog.flatMap((i) => i.primaryNames)),
  ].sort((a, b) => a.localeCompare(b, "es"));
  const secondaryOptions = [
    ...new Set(catalog.flatMap((i) => i.secondaryNames ?? [])),
  ].sort((a, b) => a.localeCompare(b, "es"));
  const sheetOptions = [
    ...new Map(
      catalog.flatMap((i) => (i.sheets ?? []).map((s) => [s.id, s] as const)),
    ).values(),
  ];
  const pool = catalog.filter((i) => !occupied.has(categoryKey(i.name)));
  const matching = catalog.filter(
    (i) =>
      matchesSearchWords(i.name, query) &&
      (!primary.length || i.primaryNames.some((n) => primary.includes(n))) &&
      (!secondary.length ||
        i.secondaryNames?.some((n) => secondary.includes(n))) &&
      (!sheets.length || i.sheets?.some((s) => sheets.includes(s.id))),
  );
  const filtered = matching.filter((i) => !onlySelected || ids.includes(i.id));
  const eligible = filtered.filter((i) => !occupied.has(categoryKey(i.name)));
  const proposalPool = matching.filter(
    (i) => !occupied.has(categoryKey(i.name)),
  );
  const ordered = filtered
    .slice()
    .sort(
      (a, b) =>
        a.primaryNames
          .join(" · ")
          .localeCompare(b.primaryNames.join(" · "), "es") ||
        a.name.localeCompare(b.name, "es"),
    );
  const toggle = (id: string) =>
    setIds((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]));
  function replaceRandom(item: TrialItem, same: boolean) {
    const candidates = pool.filter(
      (i) =>
        !ids.includes(i.id) &&
        (same
          ? i.primaryIds.length === item.primaryIds.length &&
            i.primaryIds.every((c) => item.primaryIds.includes(c))
          : !i.primaryIds.some((c) => item.primaryIds.includes(c)) &&
            i.primaryIds.length > 0),
    );
    const next = candidates[Math.floor(Math.random() * candidates.length)];
    if (!next) {
      setError(
        "No hay otro diplomado libre con esa condición. Puedes elegirlo con Editar.",
      );
      return;
    }
    setIds((v) => v.map((x) => (x === item.id ? next.id : x)));
    setError("");
  }
  async function save() {
    setBusy(true);
    setError("");
    try {
      const result: TrialGroup = await api(
        "meta-ads/inventory/trials",
        "POST",
        group
          ? {
              action: "MEMBERS",
              name,
              listId: directory.listId,
              groupId: group.id,
              revision: group.revision,
              itemIds: ids,
              since: limaToday(),
            }
          : {
              action: "CREATE",
              requestId,
              listId: directory.listId,
              name,
              itemIds: ids,
              countries,
              since: limaToday(),
              reserve: false,
              diverse: false,
              rules: { zero: 25, perSale: 50 },
            },
      );
      setCommitted(true);
      await onSaved(result.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="trial-dialog inventory-group-editor"
      aria-label={
        group ? "Editar " + group.name : "Crear grupo desde inventario"
      }
      onCancel={(e) => {
        e.preventDefault();
        if (!busy && !externalBusy) onClose();
      }}
    >
      <header>
        <h2>Crear / modificar grupo</h2>
        <button
          className="ui-close-button"
          aria-label="Cerrar edición de grupo"
          disabled={busy || externalBusy}
          onClick={onClose}
        >
          ×
        </button>
      </header>
      {topContent && (
        <nav
          className="inventory-management-tabs"
          aria-label="Gestionar inventario"
        >
          <button
            type="button"
            aria-pressed={managementTab === "top"}
            disabled={busy || externalBusy}
            onClick={() => setManagementTab("top")}
          >
            Top · evaluar y reemplazar
          </button>
          <button
            type="button"
            aria-pressed={managementTab === "create"}
            disabled={busy || externalBusy || !directory.canEdit}
            onClick={() => {
              if (group && onChooseGroup) onChooseGroup("");
              else setManagementTab("create");
            }}
          >
            Crear
          </button>
          <button
            type="button"
            aria-pressed={managementTab === "edit"}
            disabled={busy || externalBusy || !directory.canEdit}
            onClick={() => setManagementTab("edit")}
          >
            Modificar grupo
          </button>
        </nav>
      )}
      {managementTab === "top" ? (
        topContent
      ) : (
        <>
          {managementTab === "edit" && onChooseGroup && (
            <label className="inventory-management-group">
              Grupo a modificar
              <SheetSearchSelect
                label="Grupo a modificar"
                value={group?.id ?? ""}
                placeholder="Elige un grupo…"
                options={directory.groups.map((group) => ({
                  value: group.id,
                  label: group.name,
                }))}
                onSelect={onChooseGroup}
              />
            </label>
          )}
          {(managementTab !== "edit" || group) && (
            <>
              <div className="inventory-group-editor-controls">
                {
                  <label>
                    Nombre
                    <input
                      aria-label="Nombre del grupo"
                      value={name}
                      maxLength={100}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </label>
                }
                <label>
                  Buscar inventario
                  <input
                    type="search"
                    aria-label="Buscar inventario para grupo"
                    placeholder="Nombre del diplomado…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
                <label>
                  Categoría principal
                  <InventoryMultiSelect
                    label="Categoría principal para grupo"
                    options={primaryOptions.map((n) => ({
                      value: n,
                      label: n,
                    }))}
                    values={primary}
                    onChange={setPrimary}
                  />
                </label>
                <label>
                  Categorías secundarias
                  <InventoryMultiSelect
                    label="Categorías secundarias para grupo"
                    options={secondaryOptions.map((n) => ({
                      value: n,
                      label: n,
                    }))}
                    values={secondary}
                    onChange={setSecondary}
                  />
                </label>
                <label>
                  Hojas
                  <InventoryMultiSelect
                    label="Hojas para grupo"
                    options={sheetOptions.map((s) => ({
                      value: s.id,
                      label: s.name,
                    }))}
                    values={sheets}
                    onChange={setSheets}
                  />
                </label>
                {!group && (
                  <label>
                    Países
                    <InventoryMultiSelect
                      label="Países del grupo"
                      all={false}
                      options={countryOptions.map((c) => ({
                        value: c.code,
                        label: c.name,
                      }))}
                      values={countries}
                      onChange={setCountries}
                    />
                  </label>
                )}
              </div>
              <div className="row inventory-group-proposal">
                <label>
                  Cantidad
                  <input
                    type="number"
                    aria-label="Cantidad aleatoria del grupo"
                    min={1}
                    max={100}
                    value={count}
                    onChange={(e) => setCount(Number(e.target.value))}
                  />
                </label>
                <button
                  disabled={busy || !count || count > 100}
                  onClick={() => {
                    const proposal = diverseTrialItems(proposalPool, count, []);
                    setIds(proposal.map((i) => i.id));
                    setOnlySelected(true);
                    setReplacing(null);
                    setError(
                      proposal.length < count
                        ? `Se encontraron ${proposal.length} categorías principales diferentes con los filtros actuales. Revisa la propuesta.`
                        : "",
                    );
                  }}
                >
                  Proponer al azar
                </button>
                <label>
                  <input
                    type="checkbox"
                    checked={onlySelected}
                    onChange={(e) => setOnlySelected(e.target.checked)}
                  />{" "}
                  Ver seleccionados ({ids.length})
                </label>
                <button
                  disabled={busy}
                  onClick={() => {
                    setQuery("");
                    setPrimary([]);
                    setSecondary([]);
                    setSheets([]);
                    setOnlySelected(false);
                  }}
                >
                  Limpiar filtros
                </button>
                <button disabled={busy} onClick={() => setIds([])}>
                  Quitar selección
                </button>
              </div>
              {replacing && (
                <p role="status" className="notice">
                  Elige el reemplazo de{" "}
                  <strong>
                    {catalog.find((i) => i.id === replacing)?.name}
                  </strong>{" "}
                  usando los filtros.{" "}
                  <button onClick={() => setReplacing(null)}>
                    Cancelar reemplazo
                  </button>
                </p>
              )}
              <div className="table-scroll inventory-group-picker-table">
                <table>
                  <thead>
                    <tr>
                      <th>
                        <input
                          type="checkbox"
                          aria-label="Seleccionar inventarios filtrados para grupo"
                          disabled={busy || !eligible.length || !!replacing}
                          checked={
                            !!eligible.length &&
                            eligible.every((i) => ids.includes(i.id))
                          }
                          onChange={(e) =>
                            setIds((v) =>
                              e.target.checked
                                ? [
                                    ...new Set([
                                      ...v,
                                      ...eligible.map((i) => i.id),
                                    ]),
                                  ]
                                : v.filter(
                                    (id) => !eligible.some((i) => i.id === id),
                                  ),
                            )
                          }
                        />{" "}
                        Inventario ({filtered.length})
                      </th>
                      <th>Categoría principal</th>
                      <th>Categorías secundarias</th>
                      <th>Hojas</th>
                      <th>Selección</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ordered.map((i, index) => {
                      const heading =
                        i.primaryNames.join(" · ") || "Sin categoría principal";
                      const assigned = occupied.get(categoryKey(i.name));
                      return (
                        <Fragment key={i.id}>
                          {(index === 0 ||
                            heading !==
                              (ordered[index - 1].primaryNames.join(" · ") ||
                                "Sin categoría principal")) && (
                            <tr className="inventory-group-band">
                              <th colSpan={5}>{heading}</th>
                            </tr>
                          )}
                          <tr
                            data-group-candidate={i.name}
                            data-selected={ids.includes(i.id) || undefined}
                          >
                            <td>
                              <label>
                                <input
                                  type="checkbox"
                                  aria-label={"Incluir " + i.name}
                                  checked={ids.includes(i.id)}
                                  disabled={
                                    busy ||
                                    (!!assigned && !ids.includes(i.id)) ||
                                    (!!replacing && ids.includes(i.id))
                                  }
                                  onChange={() => {
                                    if (replacing) {
                                      setIds((v) =>
                                        v.map((x) =>
                                          x === replacing ? i.id : x,
                                        ),
                                      );
                                      setReplacing(null);
                                      setError("");
                                    } else toggle(i.id);
                                  }}
                                />{" "}
                                {i.name}
                              </label>
                            </td>
                            <td>{i.primaryNames.join(" · ") || "—"}</td>
                            <td>{i.secondaryNames?.join(" · ") || "—"}</td>
                            <td>
                              {i.sheets?.map((s) => s.name).join(" · ") || "—"}
                            </td>
                            <td>
                              {assigned ? (
                                <small>En {assigned}</small>
                              ) : (
                                ids.includes(i.id) && (
                                  <div className="inventory-group-row-actions">
                                    <button
                                      disabled={busy}
                                      onClick={() => {
                                        setReplacing(i.id);
                                        setOnlySelected(false);
                                        setQuery("");
                                        setPrimary([]);
                                        setSecondary([]);
                                        setSheets([]);
                                      }}
                                    >
                                      Editar
                                    </button>
                                    <button
                                      disabled={busy}
                                      onClick={() => replaceRandom(i, true)}
                                    >
                                      Azar · misma categoría
                                    </button>
                                    <button
                                      disabled={busy}
                                      onClick={() => replaceRandom(i, false)}
                                    >
                                      Azar · otra categoría
                                    </button>
                                    <button
                                      disabled={busy}
                                      aria-label={"Quitar del grupo " + i.name}
                                      onClick={() =>
                                        setIds((v) =>
                                          v.filter((x) => x !== i.id),
                                        )
                                      }
                                    >
                                      ×
                                    </button>
                                  </div>
                                )
                              )}
                            </td>
                          </tr>
                        </Fragment>
                      );
                    })}
                    {!filtered.length && (
                      <tr>
                        <td colSpan={5}>
                          No hay resultados con estos filtros.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <small>
                La selección se conserva al cambiar filtros. Cada diplomado
                pertenece a un solo grupo. Los cambios se aplican al guardar;
                los ciclos anteriores se conservan.
              </small>
              {error && (
                <p role="alert" className="notice error">
                  {error}
                </p>
              )}
              <footer>
                <span>{ids.length} diplomados seleccionados</span>
                <button disabled={busy} onClick={onClose}>
                  Cancelar
                </button>
                <button
                  className="primary"
                  disabled={
                    busy ||
                    !directory.canEdit ||
                    committed ||
                    !!replacing ||
                    ids.length > 1500 ||
                    !name.trim() ||
                    (!group &&
                      (!ids.length ||
                        !name.trim() ||
                        !countries.length ||
                        countries.length > 20))
                  }
                  onClick={() => void save()}
                >
                  {busy ? "Guardando…" : "Guardar grupo"}
                </button>
              </footer>
            </>
          )}
        </>
      )}
    </dialog>
  );
}

export function InventoryGroupSelect({
  groups,
  label,
  disabled,
  onSelect,
  value = "",
  placeholder = "Asignar grupo…",
}: {
  groups: TrialGroup[];
  label: string;
  disabled?: boolean;
  onSelect: (id: string) => void | Promise<void>;
  value?: string;
  placeholder?: string;
}) {
  return (
    <SheetSearchSelect
      label={label}
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      options={[
        ...groups.map((g) => ({ value: g.id, label: g.name })),
        { value: "new", label: "+ Crear grupo" },
      ]}
      onSelect={(id) => {
        if (id) return onSelect(id);
      }}
    />
  );
}
