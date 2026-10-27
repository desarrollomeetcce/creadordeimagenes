"use client";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { useWorkbookPreference } from "./use-workbook-preference";
import { engineRequest as api } from "./generation-engine";
import { InventoryMultiSelect } from "./inventory-multi-select";
import { InventoryImport } from "./inventory-import";
import { SheetSearchSelect } from "./sheet-search-select";
import { InventorySelectionDelete } from "./inventory-selection-delete";
import { InventoryCategoryManager } from "./inventory-category-manager";
import type {
  InventoryCategoryState,
  InventoryCategoryAction,
} from "./inventory-category-types";
import { EffectivenessCell } from "./effectiveness-cell";
type Table = {
  id: string;
  name: string;
  aliases: { id: string; name: string; inventorySheetId?: string }[];
};
function InventoryCheck({
  label,
  checked,
  mixed = false,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  mixed?: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      checked={checked}
      disabled={disabled}
      ref={(el) => {
        if (el) el.indeterminate = mixed;
      }}
      onChange={(e) => onChange(e.target.checked)}
    />
  );
}
export function InventoryCatalog({
  tables,
  listId = "default-inventory",
  initialTableId,
  sheetTabs,
  onChanged,
}: {
  listId?: string;
  tables: Table[];
  initialTableId: string;
  sheetTabs: ReactNode;
  onChanged: () => Promise<void>;
}) {
  const [target, setTarget] = useWorkbookPreference<string>(
      listId,
      "target",
      initialTableId || tables[0]?.id || "",
    ),
    [name, setName] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [categories, setCategories] = useState<InventoryCategoryState | null>(
      null,
    ),
    [categoryManager, setCategoryManager] = useState<
      "paste" | "catalog" | null
    >(null),
    [importView, setImportView] = useState<"paste" | "file" | null>(null),
    [primaryFilter, setPrimaryFilter] = useWorkbookPreference<string[]>(
      listId,
      "primaryFilter",
      [],
    ),
    [secondaryFilter, setSecondaryFilter] = useWorkbookPreference<string[]>(
      listId,
      "secondaryFilter",
      [],
    ),
    [itemFilter, setItemFilter] = useWorkbookPreference<string[]>(
      listId,
      "itemFilter",
      [],
    ),
    [sheetFilter, setSheetFilter] = useWorkbookPreference<string[]>(
      listId,
      "sheetFilter",
      [],
    );
  const filters = {
    primary: primaryFilter,
    secondary: secondaryFilter,
    items: itemFilter,
    sheets: sheetFilter,
  };
  const setFilters = (v: typeof filters) => {
    setPrimaryFilter(v.primary);
    setSecondaryFilter(v.secondary);
    setItemFilter(v.items);
    setSheetFilter(v.sheets);
  };
  const reloadCategories = async () =>
    setCategories(
      await api(
        "meta-ads/inventory/categories?" + new URLSearchParams({ listId }),
      ),
    );
  useEffect(() => {
    let active = true;
    setCategories(null);
    void api("meta-ads/inventory/categories?" + new URLSearchParams({ listId }))
      .then((v) => {
        if (active) setCategories(v);
      })
      .catch((e) => {
        if (active) setMessage(e.message);
      });
    return () => {
      active = false;
    };
  }, [listId]);
  const saveCategory = async (action: InventoryCategoryAction) => {
    if (!categories) throw Error("Recarga las categorías antes de guardar.");
    setBusy(true);
    try {
      setCategories(
        await api("meta-ads/inventory/categories", "POST", {
          listId,
          revision: categories.revision,
          ...action,
        }),
      );
    } finally {
      setBusy(false);
    }
  };
  const categoryIds = (g: { links: { id: string }[] }) => [
    ...new Set(g.links.flatMap((a) => categories?.assignments[a.id] ?? [])),
  ];
  const categoryById = new Map(categories?.categories.map((c) => [c.id, c]));
  const groupCategories = (g: { links: { id: string }[] }) =>
    categoryIds(g)
      .flatMap((id) => {
        const c = categoryById.get(id);
        return c ? [c] : [];
      })
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
  const items = tables
    .flatMap((t) =>
      t.aliases
        .filter((a) => (a.inventorySheetId ?? "default-inventory") === listId)
        .map((a) => ({ ...a, tableId: t.id, tableName: t.name })),
    )
    .sort(
      (a, b) =>
        a.name.localeCompare(b.name, "es") ||
        a.tableName.localeCompare(b.tableName, "es"),
    );
  useEffect(() => {
    if (target && !tables.some((t) => t.id === target))
      setTarget(tables[0]?.id ?? "");
  }, [tables, target]);
  const grouped = new Map<string, { name: string; links: typeof items }>();
  for (const a of items) {
    if (!grouped.has(a.name)) grouped.set(a.name, { name: a.name, links: [] });
    grouped.get(a.name)!.links.push(a);
  }
  const available = [...grouped.values()];
  const visible = available.filter(
    (g) =>
      (!filters.items.length ||
        g.links.some((a) => filters.items.includes(a.id))) &&
      (!filters.sheets.length ||
        g.links.some((a) => filters.sheets.includes(a.tableId))) &&
      (!filters.primary.length ||
        groupCategories(g).some(
          (c) => c.kind === "PRIMARY" && filters.primary.includes(c.id),
        )) &&
      (!filters.secondary.length ||
        groupCategories(g).some(
          (c) => c.kind === "SECONDARY" && filters.secondary.includes(c.id),
        )),
  );
  const bands = new Map<string, { title: string; groups: typeof visible }>();
  for (const g of visible) {
    const primary = groupCategories(g)
        .filter((c) => c.kind === "PRIMARY")
        .sort((a, b) => a.name.localeCompare(b.name, "es")),
      title =
        primary.map((c) => c.name).join(" · ") || "Sin categoría principal";
    const key = primary.map((c) => c.id).join("|") || "__none";
    if (!bands.has(key)) bands.set(key, { title, groups: [] });
    bands.get(key)!.groups.push(g);
  }
  const sections = [...bands.entries()].sort(([a, x], [b, y]) =>
    a === "__none"
      ? 1
      : b === "__none"
        ? -1
        : x.title.localeCompare(y.title, "es"),
  );
  const categoryCell = (
    g: (typeof visible)[number],
    kind: "PRIMARY" | "SECONDARY",
  ) => {
    const assigned = groupCategories(g).filter((c) => c.kind === kind);
    return (
      <td className="inventory-category-cell">
        <div className="inventory-category-chips">
          {assigned.map((c) => (
            <span
              key={c.id}
              className={"inventory-category-chip " + kind.toLowerCase()}
            >
              {c.name}
              {
                <button
                  type="button"
                  disabled={busy}
                  aria-label={`Quitar categoría ${c.name} de ${g.name}`}
                  onClick={() =>
                    void saveCategory({
                      action: "ASSIGN",
                      ids: g.links.map((a) => a.id),
                      expectedName: g.name,
                      categoryIds: categoryIds(g).filter((id) => id !== c.id),
                    }).catch((e) => setMessage(e.message))
                  }
                >
                  ×
                </button>
              }
            </span>
          ))}
          <InventoryMultiSelect
            label={`Categorías ${kind === "PRIMARY" ? "principales" : "secundarias"} de ${g.name}`}
            values={assigned.map((c) => c.id)}
            placeholder={
              assigned.length
                ? "+"
                : kind === "PRIMARY"
                  ? "+ Principal"
                  : "+ Secundaria"
            }
            compact
            onCreate={async (name, ids) => {
              await saveCategory({
                action: "IMPORT",
                rows: [
                  {
                    primary:
                      kind === "PRIMARY"
                        ? [
                            ...(categories?.categories
                              .filter((c) => ids.includes(c.id))
                              .map((c) => c.name) ?? []),
                            name,
                          ].join(", ")
                        : "",
                    secondary:
                      kind === "SECONDARY"
                        ? [
                            ...(categories?.categories
                              .filter((c) => ids.includes(c.id))
                              .map((c) => c.name) ?? []),
                            name,
                          ].join(", ")
                        : "",
                  },
                ],
                targetIds: g.links.map((a) => a.id),
              });
            }}
            options={(
              categories?.categories.filter((c) => c.kind === kind) ?? []
            ).map((c) => ({ value: c.id, label: c.name }))}
            disabled={busy || !categories}
            all={false}
            onChange={async (ids) => {
              await saveCategory({
                action: "ASSIGN",
                ids: g.links.map((a) => a.id),
                expectedName: g.name,
                categoryIds: [
                  ...categoryIds(g).filter(
                    (id) => categoryById.get(id)?.kind !== kind,
                  ),
                  ...ids,
                ],
              });
            }}
            onError={setMessage}
          />
        </div>
      </td>
    );
  };
  const [selected, setSelected] = useState<string[]>([]),
    [bulkIds, setBulkIds] = useState<string[] | null>(null);
  const visibleIds = visible.flatMap((g) => g.links.map((a) => a.id)),
    selectedVisible = visibleIds.filter((id) => selected.includes(id)),
    selectedGroups = visible.filter((g) =>
      g.links.some((a) => selected.includes(a.id)),
    ).length;
  const choose = (ids: string[], checked: boolean) =>
    setSelected((old) =>
      checked
        ? [...new Set([...old, ...ids])]
        : old.filter((id) => !ids.includes(id)),
    );
  const [removing, setRemoving] = useState(false),
    [review, setReview] = useState<{
      id: string;
      name: string;
      table: { id: string; name: string };
      rows: number;
      days: number;
      assignments: number;
      token: string;
    } | null>(null),
    [deleteError, setDeleteError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (review) dialog.current?.showModal();
  }, [review]);
  const prepareRemoval = async (id: string) => {
    setBusy(true);
    setMessage("");
    setDeleteError("");
    try {
      setReview(await api("meta-ads/aliases/" + id + "/delete-preview"));
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section
      className="inventory-catalog sheet-view"
      aria-label="Inventario sin países"
    >
      <form
        className="row sheet-toolbar"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!target || !name.trim()) return;
          setBusy(true);
          setMessage("");
          try {
            const created = await api("meta-ads/aliases", "POST", {
              inventorySheetId: listId,
              tableId: target,
              name: name.trim(),
            });
            await onChanged();

            setFilters({
              primary: [],
              secondary: [],
              items: [created.id],
              sheets: [target],
            });
            setName("");
            setMessage(
              "Inventario agregado. El país se configura en la hoja correspondiente.",
            );
          } catch (error) {
            setMessage((error as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <input
          aria-label="Nuevo ítem del inventario"
          value={name}
          maxLength={150}
          placeholder="Nombre del diplomado o ítem…"
          onChange={(e) => setName(e.target.value)}
          disabled={busy}
        />
        <SheetSearchSelect
          label="Agregar inventario a la hoja"
          value={target}
          placeholder="Elige una hoja"
          options={tables.map((t) => ({ value: t.id, label: t.name }))}
          onSelect={setTarget}
        />
        <button disabled={busy || !target || !name.trim()}>
          Agregar al inventario
        </button>
      </form>
      {message && (
        <p role="status" className="sheet-message">
          {message}
        </p>
      )}
      {sheetTabs}
      <div
        className="row inventory-actions-toolbar"
        aria-label="Acciones del inventario"
      >
        <button
          type="button"
          disabled={busy || !categories}
          onClick={() => setImportView("paste")}
        >
          Pegar inventario
        </button>
        <button
          type="button"
          disabled={busy || !categories}
          onClick={() => setImportView("file")}
        >
          Importar inventario
        </button>
        <button
          type="button"
          disabled={busy || !categories}
          onClick={() => setCategoryManager("catalog")}
        >
          Ver categorías
        </button>
        <details className="inventory-delete-menu">
          <summary>Eliminar</summary>
          <div className="inventory-delete-choices">
            <button
              type="button"
              className="danger"
              disabled={busy || !selectedVisible.length}
              onClick={() => setBulkIds([...selectedVisible])}
            >
              Ítems seleccionados ({selectedGroups})
            </button>
            <button
              type="button"
              disabled={busy || !categories}
              onClick={() => setCategoryManager("catalog")}
            >
              Categorías principales y secundarias
            </button>
            <button
              type="button"
              aria-pressed={removing}
              onClick={() => setRemoving((v) => !v)}
            >
              Vínculos con hojas {removing ? "✓" : ""}
            </button>
          </div>
        </details>
        <span role="status">{selectedGroups} seleccionados</span>
        <button
          type="button"
          onClick={() =>
            setFilters({ primary: [], secondary: [], items: [], sheets: [] })
          }
        >
          Limpiar filtros
        </button>
        {removing && <small>Pulsa × junto a la hoja que quieres quitar.</small>}
      </div>
      <div className="table-scroll">
        <table className="inventory-catalog-grid inventory-categorized-grid">
          <thead>
            <tr>
              {(["PRIMARY", "SECONDARY"] as const).map((kind) => (
                <th key={kind} scope="col">
                  <div>
                    {kind === "PRIMARY"
                      ? "Categoría principal"
                      : "Categorías secundarias"}
                  </div>
                  <InventoryMultiSelect
                    label={
                      kind === "PRIMARY"
                        ? "Filtro de categorías principales"
                        : "Filtro de categorías secundarias"
                    }
                    placeholder="Todas"
                    options={(
                      categories?.categories.filter((c) => c.kind === kind) ??
                      []
                    ).map((c) => ({ value: c.id, label: c.name }))}
                    values={
                      kind === "PRIMARY" ? filters.primary : filters.secondary
                    }
                    onChange={(v) =>
                      setFilters({
                        ...filters,
                        [kind === "PRIMARY" ? "primary" : "secondary"]: v,
                      })
                    }
                  />
                </th>
              ))}
              <th scope="col">
                <div className="inventory-header-title">
                  <InventoryCheck
                    label="Seleccionar todo el inventario visible"
                    checked={
                      !!visibleIds.length &&
                      selectedVisible.length === visibleIds.length
                    }
                    mixed={
                      selectedVisible.length > 0 &&
                      selectedVisible.length < visibleIds.length
                    }
                    disabled={busy || !visibleIds.length}
                    onChange={(checked) => choose(visibleIds, checked)}
                  />
                  <span>Inventario ({visible.length})</span>
                </div>
                <InventoryMultiSelect
                  label="Inventario del catálogo"
                  placeholder="Todo el inventario"
                  options={available.map((g) => ({
                    value: g.links[0].id,
                    label: g.name,
                  }))}
                  values={filters.items}
                  onChange={(v) => setFilters({ ...filters, items: v })}
                />
              </th>
              <th scope="col">
                <div>Hojas</div>
                <InventoryMultiSelect
                  label="Hojas del inventario"
                  placeholder="Todas las hojas"
                  options={tables.map((t) => ({ value: t.id, label: t.name }))}
                  values={filters.sheets}
                  onChange={(v) => setFilters({ ...filters, sheets: v })}
                />
              </th>
            </tr>
          </thead>
          <tbody>
            {sections.map(([key, section]) => (
              <Fragment key={key}>
                <tr
                  className="inventory-group-band"
                  data-category-group={section.title}
                >
                  <th colSpan={4} scope="rowgroup">
                    {section.title}
                    <small>{section.groups.length} ítems</small>
                  </th>
                </tr>
                {section.groups.map((g) => (
                  <tr
                    key={g.name}
                    data-inventory-name={g.name}
                    data-selected={
                      g.links.some((a) => selected.includes(a.id)) || undefined
                    }
                  >
                    {categoryCell(g, "PRIMARY")}
                    {categoryCell(g, "SECONDARY")}
                    <td>
                      <div className="inventory-name-cell">
                        <InventoryCheck
                          label={`Seleccionar inventario ${g.name}`}
                          checked={g.links.every((a) =>
                            selected.includes(a.id),
                          )}
                          mixed={
                            g.links.some((a) => selected.includes(a.id)) &&
                            !g.links.every((a) => selected.includes(a.id))
                          }
                          disabled={busy}
                          onChange={(checked) =>
                            choose(
                              g.links.map((a) => a.id),
                              checked,
                            )
                          }
                        />
                        <EffectivenessCell
                          label={`Nombre de inventario ${g.name}`}
                          value={g.name}
                          onError={setMessage}
                          onSave={async (value) => {
                            await api("meta-ads/inventory/rename", "POST", {
                              listId,
                              expectedName: g.name,
                              name: value.trim(),
                              ids: g.links.map((a) => a.id),
                            });
                            await onChanged();
                          }}
                        />
                      </div>
                    </td>
                    <td>
                      <div className="inventory-sheet-links">
                        {g.links.map((a) => (
                          <span
                            key={a.id}
                            className="inventory-sheet-chip"
                            data-inventory-id={a.id}
                          >
                            {a.tableName}
                            {removing && (
                              <button
                                type="button"
                                className="inventory-remove"
                                aria-label={`Eliminar ${g.name} de ${a.tableName}`}
                                title={`Eliminar solo de ${a.tableName}`}
                                disabled={busy}
                                onClick={() => void prepareRemoval(a.id)}
                              >
                                ×
                              </button>
                            )}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
        {!visible.length && (
          <p className="sheet-help">
            No hay elementos que coincidan con los filtros.
          </p>
        )}
      </div>
      {importView && categories && (
        <InventoryImport
          listId={listId}
          revision={categories.revision}
          upload={importView === "file"}
          onClose={() => setImportView(null)}
          onSaved={async () => {
            await onChanged();
            await reloadCategories();
            setFilters({ primary: [], secondary: [], items: [], sheets: [] });
          }}
        />
      )}
      {categoryManager && categories && (
        <InventoryCategoryManager
          config={categories}
          selectedIds={selectedVisible}
          selectedCount={selectedGroups}
          initialView={categoryManager}
          onClose={() => setCategoryManager(null)}
          onSave={saveCategory}
          onRefresh={reloadCategories}
        />
      )}
      {bulkIds && (
        <InventorySelectionDelete
          listId={listId}
          ids={bulkIds}
          onClose={() => setBulkIds(null)}
          onRemoved={async (ids) => {
            await onChanged();
            setSelected((old) => old.filter((id) => !bulkIds.includes(id)));
            setBulkIds(null);
            setMessage("Selección eliminada de las hojas confirmadas.");
          }}
        />
      )}
      <dialog
        ref={dialog}
        className="meta-detail inventory-delete-dialog"
        aria-label="Eliminar inventario de una hoja"
        onCancel={(e) => {
          if (busy) e.preventDefault();
          else setReview(null);
        }}
      >
        {review && (
          <>
            <h2>Eliminar de «{review.table.name}»</h2>
            <p>
              Se quitará «{review.name}» de esta hoja: {review.rows} filas y{" "}
              {review.days} días con datos manuales. Se retirarán{" "}
              {review.assignments} asignaciones internas en Meta.
            </p>
            <p>
              Las otras hojas conservarán este inventario. Esta eliminación no
              se puede deshacer.
            </p>
            {deleteError && <p role="alert">{deleteError}</p>}
            <div className="row">
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  dialog.current?.close();
                  setReview(null);
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="danger"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setDeleteError("");
                  let committed = false;
                  try {
                    await api("meta-ads/aliases/" + review.id, "DELETE", {
                      token: review.token,
                    });
                    committed = true;
                    dialog.current?.close();
                    setReview(null);
                    await onChanged();
                    setMessage(
                      "Inventario eliminado únicamente de «" +
                        review.table.name +
                        "».",
                    );
                  } catch (e) {
                    if (committed)
                      setMessage(
                        "Eliminado. Recarga para ver la lista actualizada.",
                      );
                    else setDeleteError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Eliminar de esta hoja
              </button>
            </div>
          </>
        )}
      </dialog>
    </section>
  );
}
