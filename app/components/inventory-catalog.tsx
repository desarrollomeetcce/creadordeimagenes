"use client";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { useWorkbookPreference } from "./use-workbook-preference";
import { engineRequest as api } from "./generation-engine";
import { SheetSearchSelect } from "./sheet-search-select";
import { InventoryMultiSelect } from "./inventory-multi-select";
import { useSheetWidths } from "./use-sheet-widths";
import { useSheetHeights } from "./use-sheet-heights";
import { SheetColumnResizer } from "./sheet-column-resizer";
import { SheetSizedRow } from "./sheet-sized-row";
import { useInventoryDuplicateReview } from "./inventory-duplicate-review";
import { splitCategoryNames } from "../../lib/meta-ads/category-paste";
import {
  InventoryNewRow,
  type InventoryNewRowValue,
} from "./inventory-new-row";
import { InventorySyllabusChips } from "./inventory-syllabus-chips";
import { InventorySyllabi } from "./inventory-syllabi";
import { InventoryPackageImport } from "./inventory-package-import";
import { InventoryImport } from "./inventory-import";
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
function InventoryActionIcon({
  name,
}: {
  name: "paste" | "import" | "categories" | "delete" | "filters";
}) {
  const paths = {
    paste:
      "M9 5H6a2 2 0 0 0-2 2v13h16V7a2 2 0 0 0-2-2h-3M9 3h6v4H9zM8 11h8M8 15h6",
    import: "M12 15V3m-4 4 4-4 4 4M4 14v6h16v-6",
    categories: "M3 3h8l10 10-8 8L3 11V3zm5 4h.01",
    delete: "M4 7h16M9 3h6l1 4H8l1-4zm-3 4 1 14h10l1-14M10 11v6m4-6v6",
    filters: "M3 4h18l-7 8v6l-4 2v-8L3 4m14 13 4 4m0-4-4 4",
  };
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={paths[name]} />
    </svg>
  );
}
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
  sheetTabs,
  onChanged,
  onOpenInventory,
}: {
  listId?: string;
  tables: Table[];
  initialTableId: string;
  sheetTabs: ReactNode;
  onChanged: () => Promise<void>;
  onOpenInventory?: (id: string) => void;
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
  const [syllabiOpen, setSyllabiOpen] = useState<{
    name: string;
    id?: string;
  } | null>(null);
  const [packageOpen, setPackageOpen] = useState(false);
  const [syllabiBusy, setSyllabiBusy] = useState(false);
  const [newRowOpen, setNewRowOpen] = useState(false);
  const duplicateReview = useInventoryDuplicateReview();
  const { widths, resize, warning } = useSheetWidths("inventory:" + listId),
    rowsLayout = useSheetHeights("inventory:" + listId);
  const removeSyllabus = async (name: string, id: string) => {
    setSyllabiBusy(true);
    let committed = false;
    try {
      const data = await api(
        "meta-ads/inventory/syllabi?" + new URLSearchParams({ listId, name }),
      );
      await api("meta-ads/inventory/syllabi", "PUT", {
        listId,
        name,
        revision: data.revision,
        syllabi: data.syllabi.filter((s: { id: string }) => s.id !== id),
      });
      committed = true;
      await reloadCategories();
    } catch (e) {
      setMessage(
        committed
          ? "Temario eliminado. Actualiza el inventario para ver el cambio."
          : e instanceof Error
            ? e.message
            : "No se pudo eliminar el temario.",
      );
    } finally {
      setSyllabiBusy(false);
    }
  };
  const renameSyllabus = async (name: string, id: string, title: string) => {
    setSyllabiBusy(true);
    let committed = false;
    try {
      const data = await api(
        "meta-ads/inventory/syllabi?" + new URLSearchParams({ listId, name }),
      );
      if (!data.syllabi.some((s: { id: string }) => s.id === id))
        throw Error("El temario cambió. Actualiza el inventario.");
      await api("meta-ads/inventory/syllabi", "PUT", {
        listId,
        name,
        revision: data.revision,
        syllabi: data.syllabi.map((s: { id: string }) =>
          s.id === id ? { ...s, title } : s,
        ),
      });
      committed = true;
      await reloadCategories();
    } catch (e) {
      if (committed)
        setMessage(
          "Nombre guardado. Actualiza el inventario para ver el cambio.",
        );
      else throw e;
    } finally {
      setSyllabiBusy(false);
    }
  };
  const columns = [
    { key: "inventory", label: "Inventario", width: 340 },
    { key: "primary", label: "Categoría principal", width: 174 },
    { key: "secondary", label: "Categorías secundarias", width: 202 },
    { key: "sheets", label: "Hojas", width: 380 },
    { key: "gap", label: "", width: 22 },
    { key: "syllabi", label: "Temarios", width: 285 },
  ];
  const columnHandle = (key: string, label: string) => (
    <SheetColumnResizer
      label={label}
      onResize={(v) => resize(key, v)}
      onReset={() => resize(key)}
    />
  );
  const [busy, setBusy] = useState(false),
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
  const [catalogCategory, setCatalogCategory] = useWorkbookPreference<string>(
    listId,
    "catalogCategory",
    "",
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
  const reloadCategories = async () => {
    const next = (await api(
      "meta-ads/inventory/categories?" + new URLSearchParams({ listId }),
    )) as InventoryCategoryState;
    setCategories(next);
    return next;
  };
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
                ...splitCategoryNames(r.secondary, 100).map((name) => ({
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
  const syllabiByName = new Map(
    categories?.items?.map((i) => [i.name, i.syllabi ?? []]),
  );
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
  const grouped = new Map<string, { name: string; links: typeof items }>();
  for (const a of items) {
    if (!grouped.has(a.name)) grouped.set(a.name, { name: a.name, links: [] });
    grouped.get(a.name)!.links.push(a);
  }
  const available = [...grouped.values()];
  const activeCategory = directoryNames.includes(catalogCategory)
    ? catalogCategory
    : "";
  const membership = new Map(
    available.map((g) => [
      g.name,
      new Set(groupCategories(g).map((c) => c.name)),
    ]),
  );
  const categoryCounts = new Map(
    directoryNames.map((name) => [
      name,
      available.filter((g) => membership.get(g.name)!.has(name)).length,
    ]),
  );
  const categoryOptions = [
    { value: "", label: "Todas las categorías" },
    ...directoryNames.map((name) => ({
      value: name,
      label: `${name} (${categoryCounts.get(name) ?? 0})`,
    })),
  ];
  const selectCategory = (name: string) => {
    setFilters({ primary: [], secondary: [], items: [], sheets: [] });
    setCatalogCategory(name);
  };
  const clearFilters = () => selectCategory("");
  const categoryInventory = activeCategory
    ? available.filter((g) => membership.get(g.name)!.has(activeCategory))
    : available;
  const visible = available.filter(
    (g) =>
      (!activeCategory || membership.get(g.name)!.has(activeCategory)) &&
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
  const bandCategorySelector = (section: {
    title: string;
    groups: typeof visible;
  }) => {
    const current = groupCategories(section.groups[0])
      .filter((c) => c.kind === "PRIMARY")
      .map((c) => c.name);
    const ids = [
      ...new Set(section.groups.flatMap((g) => g.links.map((a) => a.id))),
    ];
    const add = async (names: string[]) => {
      if (!names.length) return;
      await saveCategory({
        action: "IMPORT",
        rows: [{ primary: names.join(", "), secondary: "" }],
        targetIds: ids,
      });
      setMessage(
        `Categorías principales añadidas a ${section.groups.length} ${section.groups.length === 1 ? "ítem" : "ítems"} de esta franja.`,
      );
    };
    return (
      <InventoryMultiSelect
        label={`Añadir categorías principales a la franja ${section.title}`}
        placeholder={current.length ? "+" : "+ Principal"}
        compact
        all={false}
        values={[]}
        options={directoryNames
          .filter((name) => !current.includes(name))
          .map((name) => ({ value: name, label: name }))}
        disabled={busy || !categories}
        description={`Se añadirán a ${section.groups.length} ${section.groups.length === 1 ? "ítem visible" : "ítems visibles"} de esta franja. Se conservan sus categorías actuales.`}
        onChange={add}
        onCreate={async (name, selectedNames) => add([...selectedNames, name])}
        onError={setMessage}
      />
    );
  };
  const saveNewRow = async (
    value: InventoryNewRowValue,
    behavior: { closeDraft?: boolean; selectItem?: boolean } = {},
  ) => {
    if (!categories) throw Error("Recarga las categorías antes de guardar.");
    setBusy(true);
    let committed = false;
    try {
      const decisions = await duplicateReview.review(
        [
          ...value.primary.map((name) => ({ kind: "PRIMARY" as const, name })),
          ...value.secondary.map((name) => ({
            kind: "SECONDARY" as const,
            name,
          })),
          ...(value.name.trim()
            ? [{ kind: "INVENTORY" as const, name: value.name.trim() }]
            : []),
        ],
        [
          ...categories.categories.map((c) => ({ kind: c.kind, name: c.name })),
          ...available.map((g) => ({
            kind: "INVENTORY" as const,
            name: g.name,
          })),
        ],
      );
      await api("meta-ads/inventory/import", "POST", {
        listId,
        revision: categories.revision,
        decisions,
        rows: [
          {
            name: value.name.trim(),
            primary: value.primary.join(", "),
            secondary: value.secondary.join(", "),
            sheets: value.sheets
              .map((id) => {
                const table = tables.find((t) => t.id === id);
                if (!table)
                  throw Error(
                    "Una hoja ya no está disponible. Revisa la selección.",
                  );
                return table.name;
              })
              .join(", "),
          },
        ],
      });
      committed = true;
      await onChanged();
      const next = await reloadCategories();
      const savedName =
        decisions.find(
          (d) => d.kind === "INVENTORY" && d.name === value.name.trim(),
        )?.useName ?? value.name.trim();
      const savedItem = next.items?.find((i) => i.name === savedName);
      setFilters({
        primary: [],
        secondary: [],
        items: behavior.selectItem && savedItem ? [savedItem.id] : [],
        sheets: [],
      });
      if (behavior.selectItem) setCatalogCategory("");
      if (behavior.closeDraft !== false) setNewRowOpen(false);
      setMessage(
        behavior.selectItem
          ? `Inventario «${savedName}» disponible en la tabla.`
          : value.name.trim()
            ? "Fila de inventario guardada."
            : "Categorías guardadas. Están disponibles en Ver categorías.",
      );
    } catch (e) {
      if (!committed) throw e;
      if (behavior.closeDraft !== false) setNewRowOpen(false);
      setMessage("La fila se guardó. Recarga para ver la lista actualizada.");
    } finally {
      setBusy(false);
    }
  };
  const createHeaderCategory = async (
    kind: "PRIMARY" | "SECONDARY",
    text: string,
  ) => {
    if (!categories) throw Error("Recarga las categorías antes de guardar.");
    const names = splitCategoryNames(text, kind === "SECONDARY" ? 100 : 20);
    setBusy(true);
    try {
      const decisions = await duplicateReview.review(
        names.map((name) => ({ kind, name })),
        directoryNames.map((name) => ({ kind, name })),
      );
      const chosen = [
        ...new Set(
          names.map(
            (name) =>
              decisions.find((d) => d.kind === kind && d.name === name)
                ?.useName ?? name,
          ),
        ),
      ];
      setCategories(
        await api("meta-ads/inventory/categories", "POST", {
          listId,
          revision: categories.revision,
          action: "IMPORT",
          decisions,
          rows: [
            {
              primary: kind === "PRIMARY" ? chosen.join(", ") : "",
              secondary: kind === "SECONDARY" ? chosen.join(", ") : "",
            },
          ],
        }),
      );
      setMessage(
        `Categoría${chosen.length === 1 ? "" : "s"} «${chosen.join(" · ")}» disponible${chosen.length === 1 ? "" : "s"} en el catálogo. Puedes asignarla${chosen.length === 1 ? "" : "s"} a los ítems.`,
      );
    } finally {
      setBusy(false);
    }
  };
  const categoryCell = (
    g: (typeof visible)[number],
    kind: "PRIMARY" | "SECONDARY",
  ) => {
    const assigned = groupCategories(g).filter((c) => c.kind === kind);
    return (
      <td
        className="inventory-category-cell"
        data-fill-kind="manual"
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
  const [review, setReview] = useState<{
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
      {packageOpen && (
        <InventoryPackageImport
          onClose={() => setPackageOpen(false)}
          onSaved={async (id) => {
            await onChanged();
            await reloadCategories();
            setMessage("Catálogo cargado.");
            onOpenInventory?.(id);
          }}
        />
      )}
      {syllabiOpen && (
        <InventorySyllabi
          listId={listId}
          name={syllabiOpen.name}
          initialId={syllabiOpen.id}
          onClose={() => setSyllabiOpen(null)}
          onChanged={async () => {
            await reloadCategories();
          }}
        />
      )}
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
      <div
        className="row inventory-actions-toolbar"
        aria-label="Acciones del inventario"
      >
        <button
          type="button"
          disabled={busy}
          onClick={() => setPackageOpen(true)}
        >
          Cargar catálogo preparado
        </button>
        <div
          className="inventory-toolbar-main"
          role="group"
          aria-label="Añadir y organizar inventario"
        >
          <button
            type="button"
            className="inventory-action-primary"
            disabled={busy || !categories}
            onClick={() => setImportView("paste")}
          >
            <InventoryActionIcon name="paste" />
            Pegar inventario
          </button>
          <button
            type="button"
            disabled={busy || !categories}
            onClick={() => setImportView("file")}
          >
            <InventoryActionIcon name="import" />
            Importar inventario
          </button>
          <button
            type="button"
            disabled={busy || !categories}
            onClick={() => setCategoryManager("catalog")}
          >
            <InventoryActionIcon name="categories" />
            Ver categorías
          </button>
        </div>
        <div
          className="inventory-toolbar-delete"
          role="group"
          aria-label="Eliminar inventario seleccionado"
        >
          <button
            type="button"
            className="danger"
            disabled={busy || !selectedVisible.length}
            onClick={() => setBulkIds([...selectedVisible])}
            title="Eliminar los ítems marcados después de revisar sus hojas"
          >
            <InventoryActionIcon name="delete" />
            Eliminar
          </button>
          <span
            className="inventory-selected-count"
            data-selected={selectedGroups > 0 || undefined}
            role="status"
          >
            {selectedGroups}{" "}
            {selectedGroups === 1 ? "seleccionado" : "seleccionados"}
          </span>
        </div>
        <button
          type="button"
          className="inventory-clear-filters"
          onClick={clearFilters}
        >
          <InventoryActionIcon name="filters" />
          Limpiar filtros
        </button>
      </div>
      {sheetTabs}
      <div
        className="inventory-catalog-overview"
        aria-label="Resumen del inventario"
      >
        <div className="inventory-catalog-counter" data-counter="inventory">
          <span className="inventory-counter-icon" aria-hidden="true">
            ▦
          </span>
          <span>Inventario total</span>
          <strong data-inventory-total>
            {categories ? available.length : "—"}
          </strong>
        </div>
        <div className="inventory-catalog-counter" data-counter="categories">
          <span className="inventory-counter-icon" aria-hidden="true">
            <InventoryActionIcon name="categories" />
          </span>
          <span>Categorías</span>
          <strong data-category-total>
            {categories ? directoryNames.length : "—"}
          </strong>
        </div>
        <div className="inventory-catalog-category-picker">
          <span>Seleccionar categoría</span>
          <SheetSearchSelect
            label="Seleccionar categoría"
            value={activeCategory}
            options={categoryOptions}
            onSelect={selectCategory}
            onCreate={async (name) => createHeaderCategory("PRIMARY", name)}
            createLabel="Añadir categoría"
            onError={setMessage}
            disabled={busy || !categories}
            placeholder="Todas las categorías"
          />
          <small>Incluye categorías principales y secundarias.</small>
        </div>
        <div
          className="inventory-catalog-counter inventory-category-count-card"
          role="status"
          aria-live="polite"
        >
          <span className="inventory-counter-icon" aria-hidden="true">
            ◉
          </span>
          <span>
            {activeCategory
              ? "Inventario de esta categoría"
              : "Inventario de todas las categorías"}
          </span>
          <strong data-category-inventory-count>
            {categories ? categoryInventory.length : "—"}
          </strong>
          <small>{activeCategory || "Catálogo completo"}</small>
          <progress
            className="inventory-category-share"
            aria-label="Proporción del catálogo en la categoría seleccionada"
            max={Math.max(1, available.length)}
            value={categoryInventory.length}
          />
          <small>
            {categories && available.length
              ? `${Math.round((categoryInventory.length / available.length) * 100)}% del catálogo · `
              : ""}
            Mostrando {categories ? visible.length : "—"} de{" "}
            {categories ? categoryInventory.length : "—"}
          </small>
        </div>
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
                  options={categoryInventory.map((g) => ({
                    value: g.links[0].id,
                    label: g.name,
                    searchText: [...membership.get(g.name)!].join(" "),
                  }))}
                  categoryFilter={{
                    options: categoryOptions,
                    value: activeCategory,
                    onChange: selectCategory,
                  }}
                  values={filters.items}
                  disabled={busy || !categories}
                  description="Busca por nombre o categoría. También puedes agregar un inventario nuevo sin categorías ni hojas."
                  onCreate={async (name) =>
                    saveNewRow(
                      { name, primary: [], secondary: [], sheets: [] },
                      { closeDraft: false, selectItem: true },
                    )
                  }
                  onError={setMessage}
                  onChange={(v) => setFilters({ ...filters, items: v })}
                />
                <div className="inventory-header-category-filter">
                  <SheetSearchSelect
                    label="Categoría debajo de Inventario"
                    value={activeCategory}
                    options={categoryOptions}
                    onSelect={selectCategory}
                    onCreate={async (name) =>
                      createHeaderCategory("PRIMARY", name)
                    }
                    createLabel="Añadir categoría"
                    onError={setMessage}
                    disabled={busy || !categories}
                    placeholder="Todas las categorías"
                  />
                </div>
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
                    disabled={busy || !categories}
                    description="Busca una categoría o escribe una nueva para añadirla al catálogo."
                    onCreate={async (name) => createHeaderCategory(kind, name)}
                    createLabel="Añadir categoría"
                    onError={setMessage}
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
              <th aria-hidden="true" className="inventory-column-gap" />
              <th scope="col">{columnHandle("syllabi", "Temarios")}Temarios</th>
            </tr>
          </thead>
          <tbody>
            {sections.map(([key, section]) => (
              <Fragment key={key}>
                <tr
                  className="inventory-group-band"
                  data-category-group={section.title}
                >
                  <th colSpan={6} scope="rowgroup">
                    <div className="inventory-band-heading">
                      <span>{section.title}</span>
                      <small>
                        {section.groups.length}{" "}
                        {section.groups.length === 1 ? "ítem" : "ítems"}
                      </small>
                      {bandCategorySelector(section)}
                    </div>
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
                    <td data-fill-kind="manual">
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
                    <td data-fill-kind="manual">
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
                            </span>
                          ))}
                      </div>
                    </td>
                    <td aria-hidden="true" className="inventory-column-gap" />
                    <td className="inventory-syllabi-cell">
                      <InventorySyllabusChips
                        label={g.name}
                        syllabi={syllabiByName.get(g.name) ?? []}
                        disabled={busy || syllabiBusy}
                        onOpen={(id) => setSyllabiOpen({ name: g.name, id })}
                        onRename={(id, title) =>
                          renameSyllabus(g.name, id, title)
                        }
                        onRemove={(id) => void removeSyllabus(g.name, id)}
                        onAdd={() =>
                          setSyllabiOpen({ name: g.name, id: "__new" })
                        }
                      />
                    </td>
                  </SheetSizedRow>
                ))}
              </Fragment>
            ))}
          </tbody>
          <tfoot>
            {newRowOpen && (
              <InventoryNewRow
                directory={directoryNames}
                tables={tables}
                disabled={busy}
                onSave={saveNewRow}
                onCancel={() => setNewRowOpen(false)}
              />
            )}
            <tr className="inventory-add-row">
              <td colSpan={6}>
                <button
                  type="button"
                  disabled={busy || !categories || newRowOpen}
                  onClick={() => setNewRowOpen(true)}
                >
                  + Agregar fila
                </button>
              </td>
            </tr>
          </tfoot>
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
            clearFilters();
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
          onRefresh={async () => {
            await reloadCategories();
          }}
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
