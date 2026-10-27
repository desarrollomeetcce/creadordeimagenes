"use client";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { useWorkbookPreference } from "./use-workbook-preference";
import { engineRequest as api } from "./generation-engine";
import { InventoryMultiSelect } from "./inventory-multi-select";
import { useSheetWidths } from "./use-sheet-widths";
import { useSheetHeights } from "./use-sheet-heights";
import { SheetColumnResizer } from "./sheet-column-resizer";
import { SheetSizedRow } from "./sheet-sized-row";
import { useInventoryDuplicateReview } from "./inventory-duplicate-review";
import { splitCategoryNames } from "../../lib/meta-ads/category-paste";
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
  const categoryDrag = useRef<{
      name: string;
      categoryId: string;
      kind: "PRIMARY" | "SECONDARY";
    } | null>(null),
    [draggingCategory, setDraggingCategory] = useState<string | null>(null),
    [categoryDrop, setCategoryDrop] = useState<string | null>(null);
  const clearCategoryDrag = () => {
    categoryDrag.current = null;
    setDraggingCategory(null);
    setCategoryDrop(null);
  };
  const duplicateReview = useInventoryDuplicateReview();
  const { widths, resize, warning } = useSheetWidths("inventory:" + listId),
    rowsLayout = useSheetHeights("inventory:" + listId);
  const columns = [
    { key: "inventory", label: "Inventario", width: 340 },
    { key: "primary", label: "Categoría principal", width: 174 },
    { key: "secondary", label: "Categorías secundarias", width: 202 },
    { key: "sheets", label: "Hojas", width: 380 },
  ];
  const columnHandle = (key: string, label: string) => (
    <SheetColumnResizer
      label={label}
      onResize={(v) => resize(key, v)}
      onReset={() => resize(key)}
    />
  );
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
      const decisions =
        action.action === "IMPORT"
          ? await duplicateReview.review(
              action.rows.flatMap((r) => [
                ...splitCategoryNames(r.primary).map((name) => ({
                  kind: "PRIMARY" as const,
                  name,
                })),
                ...splitCategoryNames(r.secondary).map((name) => ({
                  kind: "SECONDARY" as const,
                  name,
                })),
              ]),
              categories.categories.map((c) => ({
                kind: c.kind,
                name: c.name,
              })),
            )
          : action.action === "MOVE"
            ? await duplicateReview.review(
                [
                  {
                    kind: action.toKind,
                    name:
                      categories.categories.find(
                        (c) => c.id === action.categoryId,
                      )?.name ?? "",
                  },
                ],
                categories.categories.map((c) => ({
                  kind: c.kind,
                  name: c.name,
                })),
              )
            : action.action === "ASSIGN_LEVEL"
              ? await duplicateReview.review(
                  action.names.map((name) => ({ kind: action.kind, name })),
                  categories.categories.map((c) => ({
                    kind: c.kind,
                    name: c.name,
                  })),
                )
              : [];
      setCategories(
        await api("meta-ads/inventory/categories", "POST", {
          listId,
          revision: categories.revision,
          ...action,
          ...(["IMPORT", "MOVE", "ASSIGN_LEVEL"].includes(action.action)
            ? { decisions }
            : {}),
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
  const directoryNames = [
    ...new Set(categories?.categories.map((c) => c.name) ?? []),
  ].sort((a, b) => a.localeCompare(b, "es"));
  const categoryFilterNames = (values: string[]) => [
    ...new Set(
      values.flatMap((value) => {
        const c = categoryById.get(value);
        return c ? [c.name] : directoryNames.includes(value) ? [value] : [];
      }),
    ),
  ];
  const primaryNames = categoryFilterNames(filters.primary),
    secondaryNames = categoryFilterNames(filters.secondary);
  const groupCategories = (g: { links: { id: string }[] }) =>
    categoryIds(g)
      .flatMap((id) => {
        const c = categoryById.get(id);
        return c ? [c] : [];
      })
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
  const items: {
    id: string;
    name: string;
    tableId: string;
    tableName: string;
    inventorySheetId?: string;
    standalone: boolean;
  }[] = [
    ...tables.flatMap((t) =>
      t.aliases
        .filter((a) => (a.inventorySheetId ?? "default-inventory") === listId)
        .map((a) => ({
          ...a,
          tableId: t.id,
          tableName: t.name,
          standalone: false,
        })),
    ),
    ...(categories?.items ?? []).map((a) => ({
      ...a,
      tableId: "",
      tableName: "",
      standalone: true,
    })),
  ].sort(
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
      (!primaryNames.length ||
        groupCategories(g).some(
          (c) => c.kind === "PRIMARY" && primaryNames.includes(c.name),
        )) &&
      (!secondaryNames.length ||
        groupCategories(g).some(
          (c) => c.kind === "SECONDARY" && secondaryNames.includes(c.name),
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
      <td
        className="inventory-category-cell"
        data-category-kind={kind}
        data-drop-active={categoryDrop === g.name + "|" + kind || undefined}
        onDragOver={(e) => {
          const from = categoryDrag.current;
          if (!busy && from?.name === g.name && from.kind !== kind) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            setCategoryDrop(g.name + "|" + kind);
          }
        }}
        onDragLeave={(e) => {
          if (
            !(e.relatedTarget instanceof Node) ||
            !e.currentTarget.contains(e.relatedTarget)
          )
            setCategoryDrop(null);
        }}
        onDrop={(e) => {
          const from = categoryDrag.current;
          if (!from || from.name !== g.name || from.kind === kind || busy)
            return;
          e.preventDefault();
          e.stopPropagation();
          clearCategoryDrag();
          void saveCategory({
            action: "MOVE",
            ids: g.links.map((a) => a.id),
            expectedName: g.name,
            categoryId: from.categoryId,
            toKind: kind,
          })
            .then(() =>
              setMessage(
                "Categoría movida a " +
                  (kind === "PRIMARY" ? "Principal" : "Secundaria") +
                  ".",
              ),
            )
            .catch((e) => setMessage(e.message));
        }}
      >
        <div className="inventory-category-chips">
          {assigned.map((c) => (
            <span
              key={c.id}
              className={
                "inventory-category-chip inventory-category-draggable " +
                kind.toLowerCase()
              }
              draggable={!busy}
              role="group"
              tabIndex={0}
              aria-label={`${c.name}. Mover a ${kind === "PRIMARY" ? "Secundaria" : "Principal"} con Alt y flecha ${kind === "PRIMARY" ? "derecha" : "izquierda"}`}
              title={`Arrastra a ${kind === "PRIMARY" ? "Secundaria" : "Principal"} · Alt+${kind === "PRIMARY" ? "→" : "←"}`}
              data-dragging={
                draggingCategory === g.name + "|" + c.id || undefined
              }
              onDragStart={(e) => {
                if (busy) {
                  e.preventDefault();
                  return;
                }
                e.stopPropagation();
                categoryDrag.current = { name: g.name, categoryId: c.id, kind };
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData(
                  "application/x-inventory-category",
                  JSON.stringify({ categoryId: c.id, listId, name: g.name }),
                );
                setDraggingCategory(g.name + "|" + c.id);
              }}
              onDragEnd={clearCategoryDrag}
              onKeyDown={(e) => {
                if (
                  e.target !== e.currentTarget ||
                  busy ||
                  !e.altKey ||
                  e.key !== (kind === "PRIMARY" ? "ArrowRight" : "ArrowLeft")
                )
                  return;
                e.preventDefault();
                e.stopPropagation();
                void saveCategory({
                  action: "MOVE",
                  ids: g.links.map((a) => a.id),
                  expectedName: g.name,
                  categoryId: c.id,
                  toKind: kind === "PRIMARY" ? "SECONDARY" : "PRIMARY",
                }).catch((e) => setMessage(e.message));
              }}
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
            values={assigned.map((c) => c.name)}
            placeholder={
              assigned.length
                ? "+"
                : kind === "PRIMARY"
                  ? "+ Principal"
                  : "+ Secundaria"
            }
            compact
            onCreate={async (name, selectedNames) => {
              await saveCategory({
                action: "IMPORT",
                rows: [
                  {
                    primary:
                      kind === "PRIMARY"
                        ? [...selectedNames, name].join(", ")
                        : "",
                    secondary:
                      kind === "SECONDARY"
                        ? [...selectedNames, name].join(", ")
                        : "",
                  },
                ],
                targetIds: g.links.map((a) => a.id),
              });
            }}
            options={directoryNames.map((name) => ({
              value: name,
              label: name,
            }))}
            disabled={busy || !categories}
            all={false}
            onChange={async (names) => {
              await saveCategory({
                action: "ASSIGN_LEVEL",
                ids: g.links.map((a) => a.id),
                expectedName: g.name,
                kind,
                names,
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
            if (!categories)
              throw Error("Recarga el inventario antes de guardar.");
            const decisions = await duplicateReview.review(
              [{ kind: "INVENTORY", name: name.trim() }],
              available.map((g) => ({ kind: "INVENTORY", name: g.name })),
            );
            await api("meta-ads/inventory/import", "POST", {
              listId,
              revision: categories.revision,
              decisions,
              rows: [
                {
                  primary: "",
                  secondary: "",
                  name: name.trim(),
                  sheets: tables.find((t) => t.id === target)!.name,
                },
              ],
            });
            await onChanged();
            await reloadCategories();
            setFilters({
              primary: [],
              secondary: [],
              items: [],
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
      {(warning || rowsLayout.warning) && (
        <p className="sheet-message" role="status">
          {warning || rowsLayout.warning}
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
        <table
          className="inventory-catalog-grid inventory-categorized-grid sheet-resizable-table"
          style={{
            width: columns.reduce((n, c) => n + (widths[c.key] ?? c.width), 0),
          }}
        >
          <colgroup>
            {columns.map((c) => (
              <col key={c.key} style={{ width: widths[c.key] ?? c.width }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th scope="col">
                {columnHandle("inventory", "Inventario")}
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
              {(["PRIMARY", "SECONDARY"] as const).map((kind) => (
                <th key={kind} scope="col">
                  {columnHandle(
                    kind === "PRIMARY" ? "primary" : "secondary",
                    kind === "PRIMARY"
                      ? "Categoría principal"
                      : "Categorías secundarias",
                  )}
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
                    options={directoryNames.map((name) => ({
                      value: name,
                      label: name,
                    }))}
                    values={kind === "PRIMARY" ? primaryNames : secondaryNames}
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
                {columnHandle("sheets", "Hojas")}
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
                  <SheetSizedRow
                    label={g.name}
                    height={rowsLayout.heights[g.links[0].id]}
                    onResize={(v) => rowsLayout.resize(g.links[0].id, v)}
                    onReset={() => rowsLayout.resize(g.links[0].id)}
                    key={g.name}
                    data-inventory-name={g.name}
                    data-selected={
                      g.links.some((a) => selected.includes(a.id)) || undefined
                    }
                  >
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
                            await reloadCategories();
                          }}
                        />
                      </div>
                    </td>
                    {categoryCell(g, "PRIMARY")}
                    {categoryCell(g, "SECONDARY")}
                    <td>
                      <div className="inventory-sheet-links">
                        {g.links
                          .filter((a) => !a.standalone)
                          .map((a) => (
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
                  </SheetSizedRow>
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
          config={categories}
          inventoryNames={available.map((g) => g.name)}
          upload={importView === "file"}
          onClose={() => setImportView(null)}
          onSaved={async () => {
            await onChanged();
            await reloadCategories();
            setMessage(
              "Guardado. Las categorías sin ítems se consultan en «Ver categorías».",
            );
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
            await reloadCategories();
            setSelected((old) => old.filter((id) => !bulkIds.includes(id)));
            setBulkIds(null);
            setMessage("Selección eliminada de las hojas confirmadas.");
          }}
        />
      )}
      {duplicateReview.dialog}
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
