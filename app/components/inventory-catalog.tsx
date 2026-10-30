"use client";
import { compareInventoryEvaluation } from "../../lib/meta-ads/inventory-evaluation-order";
import {
  InventoryColumnVisibility,
  inventoryParameters,
} from "./inventory-column-visibility";
import {
  InventoryGroupEditor,
  InventoryGroupSelect,
} from "./inventory-group-editor";
import type { TrialDirectory } from "../../lib/meta-ads/inventory-trials";
import {
  InventoryCountryCells,
  inventoryCountryMetrics,
  useInventoryCountryEvaluation,
} from "./inventory-country-evaluation";
import {
  InventoryDeactivationConfirm,
  type InventoryActivationSelection,
} from "./inventory-deactivation-confirm";
import type { InventoryCampaignChange } from "./inventory-campaign-control";
import { InventoryTop, inventoryTopPriority } from "./inventory-top";
import { InventoryFactorSettings } from "./inventory-factor-settings";
import { InventorySheetHistory } from "./inventory-sheet-history";
import { EffectivenessHistory } from "./effectiveness-history";
import { limaToday } from "./date-range";
import { InventoryAddEvaluationSheet } from "./inventory-add-evaluation-sheet";
import { countryName } from "../../lib/meta-ads/countries";
import type { InventorySheetActivationDirectory } from "../../lib/meta-ads/inventory-sheet-activation";
import { InventoryActionMenu } from "./inventory-action-menu";
import { useInventoryPinnedColumns } from "./use-inventory-pinned-columns";
import dynamic from "next/dynamic";
const InventoryTrials = dynamic(
  () => import("./inventory-trials").then((m) => m.InventoryTrials),
  { loading: () => <p role="status">Cargando grupos…</p> },
);
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { useWorkbookPreference } from "./use-workbook-preference";
import { financialRequest as api } from "./financial-request";
import { InventoryCategoryAssign } from "./inventory-category-assign";
import { InventoryCategoryFilter } from "./inventory-category-filter";
import { InventoryMultiSelect } from "./inventory-multi-select";
import { useSheetWidths } from "./use-sheet-widths";
import { useSheetHeights } from "./use-sheet-heights";
import { SheetColumnResizer } from "./sheet-column-resizer";
import { SheetSizedRow } from "./sheet-sized-row";
import { useInventoryDuplicateReview } from "./inventory-duplicate-review";
import {
  categoryKey,
  splitCategoryNames,
} from "../../lib/meta-ads/category-paste";
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
  aliases: {
    id: string;
    name: string;
    inventorySheetId?: string;
    detached?: boolean;
  }[];
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
  toolbarActions,
  onChanged,
  onOpenInventory,
}: {
  listId?: string;
  tables: Table[];
  initialTableId: string;
  sheetTabs: ReactNode;
  toolbarActions?: ReactNode;
  onChanged: () => Promise<void>;
  onOpenInventory?: (id: string) => void;
}) {
  const [trialDirectory, setTrialDirectory] = useState<TrialDirectory | null>(
    null,
  );
  const [groupEditor, setGroupEditor] = useState<{
    id?: string;
    names: string[];
    tab?: "create" | "edit" | "top";
    column?: string;
    replaceName?: string;
  } | null>(null);
  const [evaluation, setEvaluation] = useState<string | null>(null);
  const [groupFilter, setGroupFilter] = useState("");
  const [groupOrder, setGroupOrder] = useWorkbookPreference<string>(
    listId,
    "group-order",
    "",
  );
  const evaluationDialog = useRef<HTMLDialogElement>(null);
  async function reloadGroups() {
    const data: TrialDirectory = await api(
      "meta-ads/inventory/trials?" + new URLSearchParams({ listId }),
    );
    setTrialDirectory(data);
  }
  useEffect(() => {
    let active = true;
    setTrialDirectory(null);
    setGroupFilter("");
    setGroupEditor(null);
    setEvaluation(null);
    void api("meta-ads/inventory/trials?" + new URLSearchParams({ listId }))
      .then((d: TrialDirectory) => {
        if (active) setTrialDirectory(d);
      })
      .catch((e) => {
        if (active) setMessage(e.message);
      });
    return () => {
      active = false;
    };
  }, [listId]);
  useEffect(() => {
    if (evaluation) evaluationDialog.current?.showModal();
  }, [evaluation]);
  const trialGroups = trialDirectory?.groups ?? [];
  const trialItemsById = new Map(
    trialDirectory?.catalog.map((i) => [i.id, i]) ?? [],
  );
  const trialGroupByName = new Map(
    trialGroups.flatMap((g) =>
      g.members.map(
        (m) =>
          [
            categoryKey(trialItemsById.get(m.itemId)?.name ?? m.name),
            g,
          ] as const,
      ),
    ),
  );
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
  const [parameterChoice, setParameterChoice] = useWorkbookPreference<string[]>(
    listId,
    "visibleParameters",
    inventoryParameters.map((p) => p.key),
  );
  const [groupColumnIntroduced, setGroupColumnIntroduced] =
    useWorkbookPreference<string>(listId, "group-column-introduced", "");
  useEffect(() => {
    if (!groupColumnIntroduced) {
      if (parameterChoice.length && !parameterChoice.includes("group"))
        setParameterChoice((current) =>
          current.length === 1 && current[0] === "advisors"
            ? inventoryParameters.map((p) => p.key)
            : current.includes("group")
              ? current
              : [...current, "group"],
        );
      setGroupColumnIntroduced("yes");
    }
  }, [
    groupColumnIntroduced,
    parameterChoice,
    setParameterChoice,
    setGroupColumnIntroduced,
  ]);
  const [countryColumnsIntroduced, setCountryColumnsIntroduced] =
    useWorkbookPreference<string>(listId, "country-columns-introduced", "");
  const [countryChoice, setCountryChoice] = useWorkbookPreference<
    string[] | null
  >(listId, "inventory-sheet-columns", null);
  const [countryReload, setCountryReload] = useState(0);
  useEffect(() => {
    if (!countryColumnsIntroduced) {
      if (parameterChoice.length && !parameterChoice.includes("countries"))
        setParameterChoice((current) =>
          current.length === 1 && current[0] === "advisors"
            ? inventoryParameters.map((p) => p.key)
            : current.includes("countries")
              ? current
              : [...current, "countries"],
        );
      setCountryColumnsIntroduced("yes");
    }
  }, [
    countryColumnsIntroduced,
    parameterChoice,
    setParameterChoice,
    setCountryColumnsIntroduced,
  ]);
  const visibleChoices =
    parameterChoice.length === 1 && parameterChoice[0] === "advisors"
      ? inventoryParameters.map((p) => p.key)
      : parameterChoice;
  const parameters = inventoryParameters
    .filter(
      (p) => Array.isArray(visibleChoices) && visibleChoices.includes(p.key),
    )
    .map((p) => p.key);
  const showParameter = (key: string) => parameters.includes(key);
  const [sheetDirectory, setSheetDirectory] =
    useState<InventorySheetActivationDirectory | null>(null);
  const [sheetAddOpen, setSheetAddOpen] = useState(false);
  const [factorOpen, setFactorOpen] = useState(false);
  const [factorLoading, setFactorLoading] = useState(false);
  const [deactivationPrompt, setDeactivationPrompt] = useState<{
    tableId: string;
    names: string[];
    items: InventoryActivationSelection;
  } | null>(null);
  const [fullDetail, setFullDetail] = useState<{
    tableId: string;
    country: string;
    aliasId: string;
    name: string;
  } | null>(null);
  const [activationHistory, setActivationHistory] = useState<{
    tableId: string;
    name: string;
  } | null>(null);
  async function reloadSheetDirectory() {
    const next: InventorySheetActivationDirectory = await api(
      "meta-ads/inventory/sheet-activation/directory?" +
        new URLSearchParams({ listId }),
    );
    setSheetDirectory(next);
  }
  useEffect(() => {
    let alive = true;
    setSheetDirectory(null);
    void api(
      "meta-ads/inventory/sheet-activation/directory?" +
        new URLSearchParams({ listId }),
    )
      .then((d) => {
        if (alive) setSheetDirectory(d);
      })
      .catch((e) => {
        if (alive) setMessage(e.message);
      });
    return () => {
      alive = false;
    };
  }, [listId]);
  const knownCountries =
    sheetDirectory?.columns.map((column) => column.id) ?? [];
  const sheetLabel = (id: string) => {
    const column = sheetDirectory?.columns.find((column) => column.id === id);
    const table = sheetDirectory?.tables.find(
      (table) => table.id === id.split(":")[0],
    );
    const label = table?.name ?? "Hoja";
    return column?.country &&
      categoryKey(label) !== categoryKey(countryName(column.country))
      ? label + " · " + countryName(column.country)
      : label;
  };
  const countryCodes = showParameter("countries")
    ? knownCountries.filter(
        (c) =>
          countryChoice === null ||
          countryChoice.includes(c) ||
          countryChoice.includes(c.split(":")[0]),
      )
    : [];
  const [hiddenColumnKeys, setHiddenColumnKeys] = useWorkbookPreference<
    string[]
  >(listId, "inventory-hidden-columns", []);
  const visibleCountryMetrics = (id: string) =>
    inventoryCountryMetrics.filter(
      (metric) => !hiddenColumnKeys.includes(`country:${id}:${metric.key}`),
    );
  const hasCountryColumns = countryCodes.some(
    (id) => visibleCountryMetrics(id).length > 0,
  );
  const countryEvaluation = useInventoryCountryEvaluation(
    listId,
    hasCountryColumns ? countryCodes : [],
    countryReload,
  );
  const [topPreference, setTopPreference] = useWorkbookPreference<string>(
    listId,
    "inventory-top-sheet",
    "",
  );
  const [campaignFilterSheet, setCampaignFilterSheet] =
    useWorkbookPreference<string>(
      listId,
      "inventory-campaign-filter-sheet",
      "",
    );
  const [campaignFilter, setCampaignFilter] = useWorkbookPreference<string>(
    listId,
    "inventory-campaign-filter",
    "",
  );
  const topSheet =
    countryCodes.includes(topPreference) &&
    visibleCountryMetrics(topPreference).length
      ? topPreference
      : "";
  const activeCampaignFilter =
    countryCodes.includes(campaignFilterSheet) &&
    visibleCountryMetrics(campaignFilterSheet).length
      ? campaignFilter
      : "";
  const [countrySort, setCountrySort] = useState<{
    country: string;
    metric: "activation" | "factor" | "status";
    ascending: boolean;
  } | null>(null);
  const activeCountrySort =
    countrySort &&
    countryCodes.includes(countrySort.country) &&
    visibleCountryMetrics(countrySort.country).some(
      (m) => m.key === countrySort.metric,
    )
      ? countrySort
      : null;
  const countrySortButton = (
    country: string,
    metric: (typeof inventoryCountryMetrics)[number],
  ) => {
    const chosen =
      activeCountrySort?.country === country &&
      activeCountrySort.metric === metric.key;
    return (
      <button
        type="button"
        className="inventory-country-sort"
        aria-label={`Ordenar por ${metric.label} en ${sheetLabel(country)}`}
        title={
          chosen
            ? activeCountrySort.ascending
              ? "Quitar orden"
              : "Cambiar a menor primero"
            : "Ordenar de mayor a menor"
        }
        onClick={() =>
          setCountrySort(
            chosen
              ? activeCountrySort.ascending
                ? null
                : { ...activeCountrySort, ascending: true }
              : { country, metric: metric.key, ascending: false },
          )
        }
      >
        {metric.label}{" "}
        <span aria-hidden="true">
          {chosen ? (activeCountrySort.ascending ? "↑" : "↓") : "↕"}
        </span>
      </button>
    );
  };
  const campaignMatches = (name: string) => {
    if (!activeCampaignFilter) return true;
    const point = countryEvaluation.lookup.get(
      JSON.stringify([categoryKey(name), campaignFilterSheet]),
    );
    if (["NEVER", "TEST", "USED", "UNKNOWN"].includes(activeCampaignFilter))
      return (
        countryEvaluation.ready &&
        (point?.usage ?? "NEVER") === activeCampaignFilter
      );
    if (activeCampaignFilter === "HISTORY")
      return countryEvaluation.ready && !!point && point.usage !== "NEVER";
    if (activeCampaignFilter === "ACTIVE")
      return point?.activation === "ACTIVE" || point?.activation === "MIXED";
    if (activeCampaignFilter === "INACTIVE")
      return !point || point.activation === "INACTIVE";
    return (
      point?.campaignTasks.includes(
        activeCampaignFilter as "CREATE" | "STOP",
      ) ?? false
    );
  };
  const columns = [
    { key: "inventory", label: "Inventario", width: 340 },
    { key: "primary", label: "Categoría principal", width: 174 },
    { key: "secondary", label: "Categorías secundarias", width: 202 },
    { key: "sheets", label: "Hojas", width: 380 },
    { key: "group", label: "Grupo", width: 230 },
    ...countryCodes.flatMap((country) =>
      inventoryCountryMetrics.map((metric) => ({
        key: `country:${country}:${metric.key}`,
        label: sheetLabel(country) + " · " + metric.label,
        width: metric.width,
      })),
    ),
    { key: "gap", label: "", width: 22 },
    { key: "syllabi", label: "Temarios", width: 285 },
  ].filter(
    (c) =>
      !hiddenColumnKeys.includes(c.key) &&
      (c.key === "gap"
        ? showParameter("syllabi") && parameters.length > 1
        : c.key.startsWith("country:") || showParameter(c.key)),
  );
  const hideColumns = (keys: string[]) => {
    const regular = keys.filter((key) => !key.startsWith("country:"));
    if (regular.length)
      setParameterChoice((current) =>
        current.filter((key) => !regular.includes(key)),
      );
    const metrics = keys.filter((key) => key.startsWith("country:"));
    if (metrics.length)
      setHiddenColumnKeys((current) => [...new Set([...current, ...metrics])]);
  };
  const hideControl = (keys: string[], label: string) => (
    <button
      type="button"
      className="inventory-hide-button"
      aria-label={`Ocultar columna ${label}`}
      title={`Ocultar ${label}. Recuperar en Ver parámetros.`}
      onClick={() => hideColumns(keys)}
    >
      −
    </button>
  );

  const [pinnedColumns, setPinnedColumns] = useWorkbookPreference<string[]>(
    listId,
    "inventory-pinned-columns",
    [],
  );
  const tableRef = useInventoryPinnedColumns(pinnedColumns);
  const pinControl = (keys: string[], label: string) => {
    const fixed = keys.every((key) => pinnedColumns.includes(key));
    return (
      <button
        type="button"
        className="inventory-pin-button"
        data-pin-keys={keys.join("|")}
        aria-label={`${fixed ? "Desfijar" : "Fijar"} columna ${label}`}
        title={`${fixed ? "Desfijar" : "Fijar"} columna: ${label}`}
        aria-pressed={fixed}
        onClick={() =>
          setPinnedColumns((current) =>
            fixed
              ? current.filter((key) => !keys.includes(key))
              : [...new Set([...current, ...keys])],
          )
        }
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden="true"
        >
          <path d="M9 3h6l-1 6 4 4v2H6v-2l4-4-1-6ZM12 15v7" />
        </svg>
      </button>
    );
  };
  const columnHandle = (key: string, label: string) => (
    <>
      <SheetColumnResizer
        label={label}
        onResize={(v) => resize(key, v)}
        onReset={() => resize(key)}
      />
      {pinControl([key], label)}
      {hideControl([key], label)}
    </>
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
  const [catalogCategories, setCatalogCategories] = useWorkbookPreference<
    string[]
  >(listId, "catalogCategories", []);
  const [grouping, setGrouping] = useWorkbookPreference<string>(
    listId,
    "catalogGrouping",
    "continuous",
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
      const next = (await api("meta-ads/inventory/categories", "POST", {
        listId,
        revision: categories.revision,
        ...action,
        ...(["IMPORT", "MOVE", "ASSIGN_LEVEL"].includes(action.action)
          ? { decisions }
          : {}),
      })) as InventoryCategoryState;
      setCategories(next);
      if (action.action === "RENAME") {
        const source = categories.categories.find(
          (c) => c.id === action.categoryId,
        );
        const destination = next.categories.find(
          (c) => categoryKey(c.name) === categoryKey(action.name),
        );
        if (source && destination) {
          const replace = (values: string[]) => [
            ...new Set(
              values.map((value) => {
                const name =
                  categories.categories.find((c) => c.id === value)?.name ??
                  value;
                return categoryKey(name) === categoryKey(source.name)
                  ? destination.name
                  : value;
              }),
            ),
          ];
          setCatalogCategories(
            replace(
              catalogCategories.length
                ? catalogCategories
                : catalogCategory
                  ? [catalogCategory]
                  : [],
            ),
          );
          setCatalogCategory("");
          setPrimaryFilter(replace(primaryFilter));
          setSecondaryFilter(replace(secondaryFilter));
        }
        setMessage(
          "Categoría actualizada en toda la lista. Las coincidencias se unificaron sin duplicar categorías en los inventarios.",
        );
      }
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
        .filter(
          (a) =>
            (a.inventorySheetId ?? "default-inventory") === listId &&
            !a.detached,
        )
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
  const itemFilterTrack = useRef<HTMLDivElement>(null),
    previousItemFilterCount = useRef(0);
  const itemGroupById = new Map(
    available.flatMap((g) => g.links.map((a) => [a.id, g] as const)),
  );
  const itemFilterChips = [
    ...new Map<string, { key: string; name: string; ids: readonly string[] }>(
      filters.items.map((id) => {
        const group = itemGroupById.get(id);
        return group
          ? ([
              "item:" + group.name,
              {
                key: "item:" + group.name,
                name: group.name,
                ids: group.links.map((a) => a.id),
              },
            ] as const)
          : ([
              "missing:" + id,
              {
                key: "missing:" + id,
                name: "Inventario no disponible",
                ids: [id],
              },
            ] as const);
      }),
    ).values(),
  ];
  useEffect(() => {
    if (!categories) return;
    if (
      filters.items.length > previousItemFilterCount.current &&
      itemFilterTrack.current
    )
      itemFilterTrack.current.scrollLeft = itemFilterTrack.current.scrollWidth;
    previousItemFilterCount.current = filters.items.length;
  }, [filters.items, categories]);
  const noCategory = "::without-categories::";
  const activeCategories = [
    ...new Set(
      catalogCategories.length
        ? catalogCategories
        : catalogCategory
          ? [catalogCategory]
          : [],
    ),
  ].filter((name) => name === noCategory || directoryNames.includes(name));
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
    { value: noCategory, label: "Sin categorías" },
    ...directoryNames.map((name) => ({
      value: name,
      label: `${name} (${categoryCounts.get(name) ?? 0})`,
      searchLabel: name,
    })),
  ];
  const selectCategories = (names: string[]) => {
    setFilters({ primary: [], secondary: [], items: [], sheets: [] });
    setCatalogCategory("");
    setCatalogCategories(names);
  };
  const clearFilters = () => {
    selectCategories([]);
    setGroupFilter("");
    setCampaignFilter("");
    setCountrySort(null);
  };
  const matchesCategory = (g: (typeof available)[number]) =>
    !activeCategories.length ||
    activeCategories.some((name) =>
      name === noCategory
        ? !membership.get(g.name)!.size
        : membership.get(g.name)!.has(name),
    );
  const categoryInventory = available.filter(matchesCategory);
  const visible = available.filter(
    (g) =>
      matchesCategory(g) &&
      campaignMatches(g.name) &&
      (!groupFilter ||
        (groupFilter === "none"
          ? !trialGroupByName.has(categoryKey(g.name))
          : trialGroupByName.get(categoryKey(g.name))?.id === groupFilter)) &&
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
  const topItems =
    topSheet && countryEvaluation.ready
      ? visible
          .filter((group) => {
            const point = countryEvaluation.lookup.get(
              JSON.stringify([categoryKey(group.name), topSheet]),
            );
            return (
              point &&
              (point.activation === "ACTIVE" ||
                point.activation === "MIXED" ||
                point.campaignTasks.length > 0)
            );
          })
          .sort((a, b) => {
            const rank = (name: string) => {
              const point = countryEvaluation.lookup.get(
                JSON.stringify([categoryKey(name), topSheet]),
              );
              return point ? inventoryTopPriority(point) : 99;
            };
            return (
              rank(a.name) - rank(b.name) || a.name.localeCompare(b.name, "es")
            );
          })
      : [];
  const topNames = new Set(topItems.map((item) => categoryKey(item.name)));
  const remainingVisible = visible.filter(
    (item) => !topNames.has(categoryKey(item.name)),
  );
  const bands = new Map<
    string,
    { title: string; groups: typeof visible; accent?: "blue" }
  >();
  for (const g of remainingVisible) {
    const primary = groupCategories(g)
        .filter((c) => c.kind === "PRIMARY")
        .sort((a, b) => a.name.localeCompare(b.name, "es")),
      title =
        primary.map((c) => c.name).join(" · ") || "Sin categoría principal";
    const key = primary.map((c) => c.id).join("|") || "__none";
    if (!bands.has(key)) bands.set(key, { title, groups: [] });
    bands.get(key)!.groups.push(g);
  }
  const primarySections = [...bands.entries()].sort(([a, x], [b, y]) =>
    a === "__none"
      ? 1
      : b === "__none"
        ? -1
        : x.title.localeCompare(y.title, "es"),
  );
  const continuousSections: typeof primarySections = [];
  const categorized = remainingVisible.filter((g) =>
    groupCategories(g).some((c) => c.kind === "PRIMARY"),
  );
  const uncategorized = remainingVisible.filter(
    (g) => !groupCategories(g).some((c) => c.kind === "PRIMARY"),
  );
  const scopeNames = [
    ...new Set([
      ...activeCategories.filter((name) => name !== noCategory),
      ...primaryNames,
      ...secondaryNames,
    ]),
  ];
  if (categorized.length)
    continuousSections.push([
      "__continuous",
      {
        title: scopeNames.join(" · ") || "Todo el inventario",
        groups: categorized,
        accent: "blue",
      },
    ]);
  if (uncategorized.length)
    continuousSections.push([
      "__none",
      { title: "Sin categoría principal", groups: uncategorized },
    ]);
  const baseSections =
    grouping === "primary" ? primarySections : continuousSections;
  const sections: [
    string,
    (typeof primarySections)[number][1] & {
      trialTitle?: string;
      trialId?: string;
      trialCount?: number;
      hideBand?: boolean;
      top?: boolean;
    },
  ][] = [];
  if (topItems.length)
    sections.push([
      "__top",
      {
        title: "Top · " + sheetLabel(topSheet),
        groups: topItems,
        accent: "blue",
        top: true,
      },
    ]);
  if (groupOrder === "groups") {
    for (const trial of [...trialGroups, null]) {
      const members = remainingVisible.filter(
        (g) =>
          (trialGroupByName.get(categoryKey(g.name))?.id ?? null) ===
          (trial?.id ?? null),
      );
      if (!members.length) continue;
      const entries =
        grouping === "primary"
          ? baseSections
              .map(
                ([key, section]) =>
                  [
                    key,
                    {
                      ...section,
                      groups: section.groups.filter((g) => members.includes(g)),
                    },
                  ] as const,
              )
              .filter(([, section]) => section.groups.length)
          : ([["continuous", { title: "", groups: members }]] as const);
      entries.forEach(([key, section], index) =>
        sections.push([
          (trial?.id ?? "none") + ":" + key,
          {
            ...section,
            hideBand: grouping !== "primary",
            ...(index === 0
              ? {
                  trialTitle: trial?.name ?? "Sin grupo",
                  trialId: trial?.id,
                  trialCount: members.length,
                }
              : {}),
          },
        ]),
      );
    }
  } else sections.push(...baseSections);
  if (activeCountrySort) {
    const { country, metric, ascending } = activeCountrySort;
    const ordered = [...visible].sort(
      (a, b) =>
        compareInventoryEvaluation(
          countryEvaluation.lookup.get(
            JSON.stringify([categoryKey(a.name), country]),
          ),
          countryEvaluation.lookup.get(
            JSON.stringify([categoryKey(b.name), country]),
          ),
          metric,
          ascending,
        ) || a.name.localeCompare(b.name, "es"),
    );
    sections.splice(0, sections.length, [
      "country-sort",
      {
        title:
          sheetLabel(country) +
          " · " +
          (inventoryCountryMetrics.find((m) => m.key === metric)?.label ??
            "Orden") +
          (ascending ? " ↑" : " ↓"),
        groups: ordered,
        accent: "blue",
      },
    ]);
  }
  const bandCategorySelector = (section: {
    title: string;
    groups: typeof visible;
  }) => {
    const current = groupCategories(section.groups[0])
      .filter((c) => c.kind === "PRIMARY")
      .map((c) => c.name)
      .filter((name) =>
        section.groups.every((g) =>
          groupCategories(g).some(
            (c) => c.kind === "PRIMARY" && c.name === name,
          ),
        ),
      );
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
        description={`Se añadirán a ${section.groups.length} ${section.groups.length === 1 ? "ítem visible" : "ítems visibles"} de esta franja. Las demás categorías se conservan; si una ya figura como secundaria, se moverá a principal.`}
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
      if (behavior.selectItem) {
        setCatalogCategory("");
        setCatalogCategories([]);
      }
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
        hidden={!showParameter(kind === "PRIMARY" ? "primary" : "secondary")}
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
              <span className="inventory-category-chip-label" title={c.name}>
                {c.name}
              </span>
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
            description={`Si una categoría ya figura como ${kind === "PRIMARY" ? "secundaria" : "principal"}, se moverá al nivel elegido y quedará una sola vez.`}
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
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkIds, setBulkIds] = useState<string[] | null>(null);
  const [sheetRemoval, setSheetRemoval] = useState<string[] | null>(null);
  const sheetAssignment = useRef<{
    revision: number;
    items: { inventoryId: string; expectedName: string }[];
  } | null>(null);
  const visibleIds = visible.flatMap((g) => g.links.map((a) => a.id)),
    selectedVisible = visibleIds.filter((id) => selected.includes(id)),
    selectedGroups = visible.filter((g) =>
      g.links.some((a) => selected.includes(a.id)),
    ).length;
  const [assignment, setAssignment] = useState<{
    kind: "PRIMARY" | "SECONDARY";
    ids: string[];
    names: string[];
  } | null>(null);
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
  const selectedGroupNames = new Set(
    visible
      .filter((g) => g.links.some((a) => selectedVisible.includes(a.id)))
      .map((g) => categoryKey(g.name)),
  );
  const removalGroups = trialGroups
    .map((group) => ({
      groupId: group.id,
      revision: group.revision,
      itemIds: group.members
        .filter((m) =>
          selectedGroupNames.has(
            categoryKey(trialItemsById.get(m.itemId)?.name ?? m.name),
          ),
        )
        .map((m) => m.itemId),
    }))
    .filter((g) => g.itemIds.length);
  const removalCount = removalGroups.reduce((n, g) => n + g.itemIds.length, 0);
  const selectedAssignedGroups = new Set(
    visible
      .filter((g) => g.links.some((a) => selectedVisible.includes(a.id)))
      .map((g) => trialGroupByName.get(categoryKey(g.name))?.id ?? ""),
  );
  const commonSelectedGroup =
    selectedAssignedGroups.size === 1 ? [...selectedAssignedGroups][0] : "";
  async function changeSheetActivation(
    tableId: string,
    names: string[],
    change: InventoryCampaignChange,
    confirmedItems?: InventoryActivationSelection,
  ) {
    if (busy || !names.length || !countryEvaluation.ready) return;
    const items =
      confirmedItems ??
      names.map((name) => ({
        name,
        targets:
          countryEvaluation.lookup.get(
            JSON.stringify([categoryKey(name), tableId]),
          )?.targets ?? [],
      }));
    if (
      !confirmedItems &&
      change.active === false &&
      change.pinned === undefined &&
      names.some((name) => {
        const row = countryEvaluation.lookup.get(
          JSON.stringify([categoryKey(name), tableId]),
        );
        return row && row.activation !== "INACTIVE";
      })
    ) {
      setDeactivationPrompt({ tableId, names: [...names], items });
      return;
    }
    setBusy(true);
    setMessage("");
    let committed = false;
    try {
      await api("meta-ads/inventory/sheet-activation", "PATCH", {
        listId,
        tableId: tableId.split(":")[0],
        ...(tableId.includes(":") ? { country: tableId.split(":")[1] } : {}),
        items,
        ...change,
      });
      committed = true;
      setCountryReload((v) => v + 1);
      await onChanged();
      await reloadCategories();
      await reloadSheetDirectory();
    } catch (e) {
      setMessage(
        (committed ? "Cambio guardado. Actualiza la vista. " : "") +
          (e as Error).message,
      );
      setCountryReload((v) => v + 1);
    } finally {
      setBusy(false);
    }
  }
  async function assignGroupDirectly(id: string, names: string[]) {
    if (id === "new") {
      setGroupEditor({ names });
      return;
    }
    if (busy || !trialDirectory?.canEdit || !names.length) return;
    const group = trialGroups.find((g) => g.id === id);
    if (!group) {
      setMessage("El grupo cambió. Actualiza.");
      return;
    }
    setBusy(true);
    setMessage("");
    let committed = false;
    try {
      const itemIds = [
        ...new Set(
          names.map(
            (name) =>
              trialDirectory.catalog.find(
                (i) => categoryKey(i.name) === categoryKey(name),
              )?.id,
          ),
        ),
      ];
      if (itemIds.some((id) => !id))
        throw Error("Un diplomado cambió. Actualiza el inventario.");
      await api("meta-ads/inventory/trials", "POST", {
        action: "ADD_MEMBERS",
        listId,
        groupId: id,
        revision: group.revision,
        itemIds,
        since: new Intl.DateTimeFormat("en-CA", {
          timeZone: "America/Lima",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date()),
      });
      committed = true;
      setSelected([]);
      await reloadGroups();
      await onChanged();
      await reloadCategories();
      setMessage(
        `${names.length} diplomado${names.length === 1 ? "" : "s"} asignado${names.length === 1 ? "" : "s"} a ${group.name}.`,
      );
    } catch (e) {
      setMessage(
        committed
          ? "Grupo asignado. Actualiza para ver el cambio."
          : e instanceof Error
            ? e.message
            : "No se pudo asignar el grupo.",
      );
      if (!committed) {
        await reloadGroups().catch(() => {});
        throw e;
      }
    } finally {
      setBusy(false);
    }
  }
  async function removeGroupMembers(groups: typeof removalGroups) {
    if (!groups.length || busy) return;
    setBusy(true);
    setMessage("");
    let committed = false;
    try {
      const result = await api("meta-ads/inventory/trials", "POST", {
        action: "REMOVE_MEMBERS",
        listId,
        groups,
      });
      committed = true;
      await reloadGroups();
      setMessage(
        `Grupo retirado de ${result.removed} diplomado${result.removed === 1 ? "" : "s"}.`,
      );
    } catch (e) {
      setMessage(
        committed
          ? "Las asignaciones se quitaron. Actualiza para ver el cambio."
          : e instanceof Error
            ? e.message
            : "No se pudo quitar el grupo.",
      );
      if (!committed) await reloadGroups().catch(() => {});
    } finally {
      setBusy(false);
    }
  }
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
  const fullDetailContent = fullDetail && (
    <EffectivenessHistory
      key={fullDetail.aliasId + ":" + fullDetail.country}
      {...fullDetail}
      autoOpen
      initialSince={new Date(Date.parse(limaToday()) - 10 * 86400000)
        .toISOString()
        .slice(0, 10)}
      initialUntil={limaToday()}
      onPeriod={() => {}}
      onClose={() => setFullDetail(null)}
    />
  );
  return (
    <section
      className="inventory-catalog sheet-view"
      aria-label="Inventario sin países"
    >
      {groupEditor && trialDirectory && (
        <InventoryGroupEditor
          key={[
            groupEditor.id,
            groupEditor.tab,
            groupEditor.column,
            groupEditor.replaceName,
          ].join(":")}
          initialTab={groupEditor.tab}
          externalBusy={busy}
          onChooseGroup={(id) =>
            setGroupEditor({
              id: id || undefined,
              names: [],
              tab: id ? "edit" : "create",
            })
          }
          topContent={
            <>
              <InventoryTop
                onBusyChange={setBusy}
                directory={trialDirectory}
                columns={knownCountries
                  .filter((id) => id.includes(":"))
                  .map((id) => ({ value: id, label: sheetLabel(id) }))}
                initialColumn={
                  groupEditor.column ?? topSheet ?? countryCodes[0]
                }
                initialReplaceName={groupEditor.replaceName}
                onChanged={async () => {
                  setCountryReload((value) => value + 1);
                  await reloadGroups();
                  await onChanged();
                  await reloadCategories();
                  await reloadSheetDirectory();
                }}
                onDetail={(column, name, aliasId) =>
                  setFullDetail({
                    tableId: column.split(":")[0],
                    country: column.split(":")[1],
                    name,
                    aliasId,
                  })
                }
              />
              {fullDetailContent}
            </>
          }
          directory={trialDirectory}
          group={trialGroups.find((g) => g.id === groupEditor.id)}
          initialNames={groupEditor.names}
          onClose={() => setGroupEditor(null)}
          onSaved={async () => {
            await reloadGroups();
            await onChanged();
            await reloadCategories();
            setGroupEditor(null);
            setSelected([]);
            setMessage("Grupo guardado.");
          }}
        />
      )}
      {evaluation && (
        <dialog
          ref={evaluationDialog}
          className="trial-dialog inventory-group-evaluation"
          aria-label="Evaluación del grupo por país"
          onCancel={(e) => {
            e.preventDefault();
            setEvaluation(null);
            void reloadGroups().catch((e) => setMessage(e.message));
          }}
        >
          <header>
            <h2>
              {trialGroups.find((g) => g.id === evaluation)?.name ?? "Grupo"} ·
              Evaluación por país
            </h2>
            <button
              className="ui-close-button"
              aria-label="Cerrar evaluación del grupo"
              onClick={() => {
                setEvaluation(null);
                void reloadGroups().catch((e) => setMessage(e.message));
              }}
            >
              ×
            </button>
          </header>
          <InventoryTrials listId={listId} fixedGroupId={evaluation} />
        </dialog>
      )}
      {!groupEditor && fullDetailContent}
      {activationHistory && (
        <InventorySheetHistory
          listId={listId}
          tableId={activationHistory.tableId}
          name={activationHistory.name}
          sheetName={sheetLabel(activationHistory.tableId)}
          onClose={() => setActivationHistory(null)}
        />
      )}
      {deactivationPrompt && (
        <InventoryDeactivationConfirm
          names={deactivationPrompt.names}
          sheetName={sheetLabel(deactivationPrompt.tableId)}
          onClose={() => setDeactivationPrompt(null)}
          onConfirm={async (pin) => {
            await changeSheetActivation(
              deactivationPrompt.tableId,
              deactivationPrompt.names,
              { active: false, pinned: pin },
              deactivationPrompt.items,
            );
          }}
        />
      )}
      {factorOpen && sheetDirectory && (
        <InventoryFactorSettings
          listId={listId}
          directory={sheetDirectory}
          onClose={() => setFactorOpen(false)}
          onSaved={async () => {
            await reloadSheetDirectory();
            setCountryReload((value) => value + 1);
          }}
        />
      )}
      {sheetAddOpen && sheetDirectory && (
        <InventoryAddEvaluationSheet
          listId={listId}
          directory={sheetDirectory}
          onClose={() => setSheetAddOpen(false)}
          onSaved={async (id) => {
            await reloadSheetDirectory();
            setCountryChoice([...new Set([...countryCodes, id])]);
            setCountryReload((v) => v + 1);
            await onChanged();
          }}
        />
      )}
      {assignment && (
        <InventoryCategoryAssign
          kind={assignment.kind}
          inventoryNames={assignment.names}
          categoryNames={directoryNames}
          onClose={() => setAssignment(null)}
          onRemoveAll={async () => {
            await saveCategory({
              action: "CLEAR_BULK",
              ids: assignment.ids,
              kind: assignment.kind,
            });
            setSelected([]);
            setMessage("Categorías retiradas de los seleccionados.");
          }}
          onApply={async (names, remove) => {
            await saveCategory({
              action: remove ? "REMOVE_BULK" : "ASSIGN_BULK",
              ids: assignment.ids,
              kind: assignment.kind,
              names,
            });
            setSelected([]);
            setMessage(
              `Categorías ${assignment.kind === "PRIMARY" ? "principales" : "secundarias"} ${remove ? "retiradas de" : "asignadas a"} ${assignment.names.length} inventarios.`,
            );
          }}
        />
      )}
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
        className="row inventory-actions-toolbar sheet-toolbar-with-actions"
        aria-label="Acciones del inventario"
      >
        <div className="row sheet-toolbar-controls">
          <button
            type="button"
            disabled={!trialDirectory || busy}
            onClick={() =>
              setGroupEditor({
                tab: selectedVisible.length ? "create" : "top",
                names: available
                  .filter((g) =>
                    g.links.some((a) => selectedVisible.includes(a.id)),
                  )
                  .map((g) => g.name),
              })
            }
          >
            Crear / modificar grupo
          </button>
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
          <button
            type="button"
            disabled={!selected.length || busy}
            onClick={() => setSelected([])}
          >
            Quitar selección
          </button>
          <InventoryColumnVisibility
            values={parameters}
            onChange={setParameterChoice}
            hiddenColumns={countryCodes.flatMap((id) =>
              inventoryCountryMetrics
                .filter((metric) =>
                  hiddenColumnKeys.includes(`country:${id}:${metric.key}`),
                )
                .map((metric) => ({
                  key: `country:${id}:${metric.key}`,
                  label: sheetLabel(id) + " · " + metric.label,
                })),
            )}
            sheetColumns={knownCountries.map((id) => ({
              id,
              label: sheetLabel(id),
              checked:
                countryCodes.includes(id) &&
                visibleCountryMetrics(id).length > 0,
              partial:
                countryCodes.includes(id) &&
                visibleCountryMetrics(id).length > 0 &&
                visibleCountryMetrics(id).length <
                  inventoryCountryMetrics.length,
            }))}
            onToggleSheet={(id, checked) => {
              if (checked) {
                setParameterChoice((current) =>
                  current.includes("countries")
                    ? current
                    : [...current, "countries"],
                );
                setCountryChoice([...new Set([...countryCodes, id])]);
                setHiddenColumnKeys((current) =>
                  current.filter((key) => !key.startsWith(`country:${id}:`)),
                );
              } else
                setCountryChoice(countryCodes.filter((value) => value !== id));
            }}
            onRestoreColumn={(key) =>
              setHiddenColumnKeys((current) =>
                current.filter((value) => value !== key),
              )
            }
            onRestoreAll={() => {
              setParameterChoice(inventoryParameters.map((p) => p.key));
              setHiddenColumnKeys([]);
              setCountryChoice(null);
            }}
          />
        </div>
        {toolbarActions}
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
          <InventoryCategoryFilter
            label="Seleccionar categoría"
            values={activeCategories}
            options={categoryOptions}
            onChange={selectCategories}
            onCreate={async (name) => createHeaderCategory("PRIMARY", name)}
            onError={setMessage}
            disabled={busy || !categories}
          />
          <small>
            {hasCountryColumns
              ? "Evaluación en S/ · Factor = presupuesto acumulado ÷ límite × 100. Desde 100%: alerta."
              : "Incluye categorías principales y secundarias."}
          </small>
          <div
            className="inventory-grouping-controls"
            role="group"
            aria-label="Vista del inventario"
          >
            <button
              type="button"
              aria-pressed={grouping !== "primary"}
              onClick={() => setGrouping("continuous")}
            >
              Lista continua
            </button>
            <button
              type="button"
              aria-pressed={grouping === "primary"}
              onClick={() => setGrouping("primary")}
            >
              Por categoría principal
            </button>
          </div>
        </div>
        {showParameter("countries") && (
          <div className="inventory-country-controls">
            <button
              type="button"
              aria-label="Definir límites del factor"
              disabled={busy || factorLoading || !sheetDirectory}
              onClick={async () => {
                setFactorLoading(true);
                try {
                  await reloadSheetDirectory();
                  setFactorOpen(true);
                } catch (e) {
                  setMessage((e as Error).message);
                } finally {
                  setFactorLoading(false);
                }
              }}
            >
              {factorLoading ? "…" : "Factor"}
            </button>
            <InventoryMultiSelect
              label="Hojas de evaluación visibles"
              placeholder="Hojas de evaluación"
              all={false}
              selectAll
              values={countryCodes}
              options={knownCountries.map((c) => ({
                value: c,
                label: sheetLabel(c),
              }))}
              onChange={setCountryChoice}
            />
            <button
              type="button"
              disabled={busy || !sheetDirectory?.canEdit}
              onClick={() => setSheetAddOpen(true)}
            >
              Agregar hoja
            </button>
            <button
              type="button"
              aria-label="Actualizar evaluación del inventario"
              disabled={countryEvaluation.loading || !countryCodes.length}
              onClick={() => setCountryReload((v) => v + 1)}
            >
              Actualizar evaluación
            </button>
          </div>
        )}
      </div>
      <div
        className="table-scroll inventory-table-scroll"
        role="region"
        aria-label="Tabla de inventario desplazable"
        tabIndex={0}
      >
        <table
          ref={tableRef}
          hidden={!columns.length}
          className="inventory-catalog-grid inventory-categorized-grid sheet-resizable-table"
          style={{
            width: columns.reduce((n, c) => n + (widths[c.key] ?? c.width), 0),
          }}
        >
          <colgroup>
            {columns.map((c) => (
              <col
                key={c.key}
                data-column-key={c.key}
                style={{ width: widths[c.key] ?? c.width }}
              />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th
                scope="col"
                rowSpan={hasCountryColumns ? 2 : 1}
                hidden={!showParameter("inventory")}
              >
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
                <div className="inventory-header-category-filter">
                  <InventoryCategoryFilter
                    label="Categorías del inventario"
                    values={activeCategories}
                    options={categoryOptions}
                    onChange={selectCategories}
                    onCreate={async (name) =>
                      createHeaderCategory("PRIMARY", name)
                    }
                    onError={setMessage}
                    disabled={busy || !categories}
                  />
                </div>
                <div className="inventory-item-filter">
                  <InventoryMultiSelect
                    label="Inventario del catálogo"
                    placeholder={
                      activeCategories.length === 1 &&
                      activeCategories[0] === noCategory
                        ? "Inventario sin categorías"
                        : activeCategories.length
                          ? "Inventario de las categorías elegidas"
                          : "Todo el inventario"
                    }
                    options={categoryInventory.map((g) => ({
                      value: g.links[0].id,
                      label: g.name,
                    }))}
                    values={filters.items}
                    disabled={busy || !categories}
                    description={
                      activeCategories.length
                        ? "Busca por nombre dentro de las categorías elegidas. Para ver otros inventarios, cambia o quita la categoría de arriba."
                        : "Busca por el nombre del inventario. Para buscar un área, usa el selector de categorías de arriba."
                    }
                    createLabel="Crear inventario"
                    onCreate={async (name) =>
                      saveNewRow(
                        { name, primary: [], secondary: [], sheets: [] },
                        { closeDraft: false, selectItem: true },
                      )
                    }
                    onError={setMessage}
                    onChange={(v) => setFilters({ ...filters, items: v })}
                  />
                  {categories && itemFilterChips.length > 0 && (
                    <div
                      ref={itemFilterTrack}
                      className="inventory-item-filter-chips"
                      role="group"
                      aria-label="Inventarios filtrados"
                      tabIndex={0}
                    >
                      {itemFilterChips.map((chip) => (
                        <span
                          key={chip.key}
                          data-inventory-filter-chip={chip.name}
                        >
                          <span title={chip.name}>{chip.name}</span>
                          <button
                            type="button"
                            aria-label={`Quitar filtro de inventario ${chip.name}`}
                            title={`Quitar ${chip.name}`}
                            disabled={busy}
                            onClick={() =>
                              setFilters({
                                ...filters,
                                items: filters.items.filter(
                                  (id) => !chip.ids.includes(id),
                                ),
                              })
                            }
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </th>
              {(["PRIMARY", "SECONDARY"] as const).map((kind) => (
                <th
                  key={kind}
                  scope="col"
                  rowSpan={hasCountryColumns ? 2 : 1}
                  hidden={
                    !showParameter(kind === "PRIMARY" ? "primary" : "secondary")
                  }
                >
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
                  <button
                    type="button"
                    className="inventory-header-assign"
                    aria-label={`Asignar o quitar categoría ${kind === "PRIMARY" ? "principal" : "secundaria"} a seleccionados`}
                    disabled={busy || !categories || !selectedGroups}
                    title={
                      selectedGroups
                        ? `Asignar a ${selectedGroups} inventarios seleccionados visibles`
                        : "Marca los inventarios que deseas actualizar"
                    }
                    onClick={() =>
                      setAssignment({
                        kind,
                        ids: [...selectedVisible],
                        names: visible
                          .filter((g) =>
                            g.links.some((a) => selectedVisible.includes(a.id)),
                          )
                          .map((g) => g.name),
                      })
                    }
                  >
                    Asignar o quitar
                    {selectedGroups ? ` (${selectedGroups})` : ""}
                  </button>
                </th>
              ))}
              <th
                scope="col"
                rowSpan={hasCountryColumns ? 2 : 1}
                hidden={!showParameter("sheets")}
              >
                {columnHandle("sheets", "Hojas")}
                <div>Hojas</div>
                <InventoryMultiSelect
                  label="Hojas del inventario"
                  placeholder="Todas las hojas"
                  options={tables.map((t) => ({ value: t.id, label: t.name }))}
                  values={filters.sheets}
                  onChange={(v) => setFilters({ ...filters, sheets: v })}
                />
                <InventoryActionMenu
                  label="Asignar o quitar hojas"
                  disabled={busy || !selectedGroups}
                >
                  <InventoryMultiSelect
                    label="Asignar hojas a inventarios seleccionados"
                    onOpen={() => {
                      sheetAssignment.current = categories
                        ? {
                            revision: categories.revision,
                            items: visible
                              .filter((g) =>
                                g.links.some((a) =>
                                  selectedVisible.includes(a.id),
                                ),
                              )
                              .map((g) => ({
                                inventoryId: g.links.find((a) =>
                                  selectedVisible.includes(a.id),
                                )!.id,
                                expectedName: g.name,
                              })),
                          }
                        : null;
                    }}
                    placeholder={
                      "Asignar hojas" +
                      (selectedGroups ? " (" + selectedGroups + ")" : "")
                    }
                    values={[]}
                    all={false}
                    options={tables.map((t) => ({
                      value: t.id,
                      label: t.name,
                    }))}
                    disabled={busy || !categories || !selectedGroups}
                    description={
                      "Añade las hojas elegidas a " +
                      selectedGroups +
                      " inventarios seleccionados visibles. Los vínculos actuales se conservan."
                    }
                    onError={setMessage}
                    onChange={async (tableIds) => {
                      if (!tableIds.length || !categories) return;
                      const snapshot = sheetAssignment.current;
                      if (!snapshot)
                        throw Error(
                          "Vuelve a abrir Asignar hojas para revisar la selección.",
                        );
                      const items = snapshot.items;
                      if (!items.length) return;
                      setBusy(true);
                      let committed = false;
                      try {
                        const result = await api(
                          "meta-ads/inventory/sheets/batch",
                          "POST",
                          {
                            listId,
                            revision: snapshot.revision,
                            tableIds,
                            items,
                          },
                        );
                        committed = true;
                        setSelected([]);
                        await onChanged();
                        await reloadCategories();
                        setMessage(
                          result.created
                            ? `Hojas asignadas a ${result.items} inventarios: ${result.created} vínculos nuevos.`
                            : "Los inventarios ya están en las hojas elegidas.",
                        );
                      } catch (e) {
                        if (committed)
                          setMessage(
                            "Las hojas se asignaron. Actualiza para ver los cambios.",
                          );
                        else throw e;
                      } finally {
                        setBusy(false);
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="inventory-header-assign"
                    disabled={
                      busy ||
                      !trialDirectory?.canEdit ||
                      !visible.some(
                        (g) =>
                          g.links.some((a) => selectedVisible.includes(a.id)) &&
                          g.links.some((a) => !a.standalone),
                      )
                    }
                    onClick={() =>
                      setSheetRemoval(
                        visible
                          .filter((g) =>
                            g.links.some((a) => selectedVisible.includes(a.id)),
                          )
                          .flatMap((g) =>
                            g.links
                              .filter((a) => !a.standalone)
                              .map((a) => a.id),
                          ),
                      )
                    }
                  >
                    Quitar hojas de seleccionados
                    {selectedGroups ? ` (${selectedGroups})` : ""}
                  </button>
                </InventoryActionMenu>
              </th>
              <th
                scope="col"
                rowSpan={hasCountryColumns ? 2 : 1}
                hidden={!showParameter("group")}
              >
                {columnHandle("group", "Grupo")}
                <div className="inventory-group-heading">
                  <span>Grupo</span>
                  <button
                    type="button"
                    aria-label="Ordenar inventario por grupos"
                    aria-pressed={groupOrder === "groups"}
                    onClick={() =>
                      setGroupOrder(groupOrder === "groups" ? "" : "groups")
                    }
                  >
                    {groupOrder === "groups"
                      ? "Ordenado por grupos ✓"
                      : "Ordenar por grupos"}
                  </button>
                </div>
                <div className="inventory-group-filter-control">
                  <select
                    title="Filtrar filas; no cambia sus asignaciones"
                    aria-label="Filtrar inventario por grupo"
                    value={groupFilter}
                    onChange={(e) => {
                      if (e.target.value === "new")
                        setGroupEditor({
                          names: visible
                            .filter((g) =>
                              g.links.some((a) =>
                                selectedVisible.includes(a.id),
                              ),
                            )
                            .map((g) => g.name),
                        });
                      else setGroupFilter(e.target.value);
                    }}
                  >
                    <option value="">Ver: todos los grupos</option>
                    <option value="none">Ver: sin grupo</option>
                    <option
                      value="new"
                      disabled={!trialDirectory?.canEdit || busy}
                    >
                      + Crear grupo…
                    </option>
                    {trialGroups.map((g) => (
                      <option key={g.id} value={g.id}>
                        Ver: {g.name} ({g.members.length})
                      </option>
                    ))}
                  </select>
                  {groupFilter && (
                    <button
                      type="button"
                      aria-label="Quitar filtro de grupo"
                      title="Volver a ver todo el inventario"
                      onClick={() => setGroupFilter("")}
                    >
                      ×
                    </button>
                  )}
                </div>
                <InventoryActionMenu
                  label="Asignar o quitar grupos"
                  disabled={busy || !selectedGroups}
                >
                  <InventoryGroupSelect
                    groups={trialGroups}
                    value={commonSelectedGroup}
                    placeholder={
                      selectedAssignedGroups.size > 1
                        ? "Varios grupos seleccionados"
                        : "Asignar grupo a seleccionados…"
                    }
                    label="Asignar grupo a inventarios seleccionados"
                    disabled={
                      !trialDirectory?.canEdit ||
                      !selectedVisible.length ||
                      busy
                    }
                    onSelect={(id) =>
                      assignGroupDirectly(
                        id,
                        visible
                          .filter((g) =>
                            g.links.some((a) => selectedVisible.includes(a.id)),
                          )
                          .map((g) => g.name),
                      )
                    }
                  />
                  <button
                    type="button"
                    className="inventory-remove-group-bulk"
                    disabled={!trialDirectory?.canEdit || busy || !removalCount}
                    onClick={() => void removeGroupMembers(removalGroups)}
                    title="Quita la asignación solo de los diplomados seleccionados visibles; conserva los grupos y el inventario"
                  >
                    Quitar grupo a seleccionados
                    {removalCount ? ` (${removalCount})` : ""}
                  </button>
                </InventoryActionMenu>
              </th>
              {countryCodes.map((country) => (
                <th
                  key={country}
                  scope="colgroup"
                  hidden={!visibleCountryMetrics(country).length}
                  colSpan={Math.max(1, visibleCountryMetrics(country).length)}
                  className="inventory-country-heading"
                  data-country-block={country}
                >
                  {pinControl(
                    visibleCountryMetrics(country).map(
                      (metric) => `country:${country}:${metric.key}`,
                    ),
                    sheetLabel(country),
                  )}
                  {hideControl(
                    inventoryCountryMetrics.map(
                      (metric) => `country:${country}:${metric.key}`,
                    ),
                    sheetLabel(country),
                  )}
                  <span className="inventory-sheet-heading-name">
                    {sheetLabel(country)}
                  </span>
                  <button
                    type="button"
                    className="inventory-sheet-top-control"
                    aria-label={`Ver Top de ${sheetLabel(country)}`}
                    aria-pressed={topSheet === country}
                    title="Activos y pendientes primero, seguidos de los grupos"
                    onClick={() => {
                      setTopPreference(topSheet === country ? "" : country);
                      setGroupFilter("");
                      setGroupOrder("groups");
                    }}
                  >
                    Top
                  </button>{" "}
                  <button
                    type="button"
                    aria-label={`Analizar Top de ${sheetLabel(country)}`}
                    title="Ver resultados y reemplazar diplomados"
                    disabled={busy || !trialDirectory}
                    onClick={() =>
                      setGroupEditor({ names: [], tab: "top", column: country })
                    }
                  >
                    ↗
                  </button>
                  <select
                    className="inventory-campaign-filter"
                    aria-label={`Filtrar campañas de ${sheetLabel(country)}`}
                    value={
                      campaignFilterSheet === country ? campaignFilter : ""
                    }
                    onChange={(e) => {
                      setCampaignFilterSheet(country);
                      setCampaignFilter(e.target.value);
                    }}
                  >
                    <option value="">Todos</option>
                    <option value="ACTIVE">Activos</option>
                    <option value="CREATE">Por hacer campaña</option>
                    <option value="STOP">Por desactivar campaña</option>
                    <option value="INACTIVE">Desactivados</option>
                    <option value="HISTORY">Con historial de activación</option>
                    <option value="NEVER">Nunca activados</option>
                    <option value="TEST">Pruebas · menos de 12 h</option>
                    <option value="USED">Usados · 12 h o más</option>
                    <option value="UNKNOWN">Tiempo no registrado</option>
                  </select>
                </th>
              ))}
              <th
                rowSpan={hasCountryColumns ? 2 : 1}
                hidden={!columns.some((c) => c.key === "gap")}
                aria-hidden="true"
                className="inventory-column-gap"
              />
              <th
                scope="col"
                rowSpan={hasCountryColumns ? 2 : 1}
                hidden={!showParameter("syllabi")}
              >
                {columnHandle("syllabi", "Temarios")}Temarios
              </th>
            </tr>
            {hasCountryColumns && (
              <tr className="inventory-country-subheaders">
                {countryCodes.flatMap((country) =>
                  visibleCountryMetrics(country).map((metric) => (
                    <th
                      scope="col"
                      key={country + ":" + metric.key}
                      data-country-block={country}
                      data-country-metric={metric.key}
                      aria-sort={
                        activeCountrySort?.country === country &&
                        activeCountrySort.metric === metric.key
                          ? activeCountrySort.ascending
                            ? "ascending"
                            : "descending"
                          : "none"
                      }
                    >
                      <SheetColumnResizer
                        label={sheetLabel(country) + " · " + metric.label}
                        onResize={(v) =>
                          resize(`country:${country}:${metric.key}`, v)
                        }
                        onReset={() =>
                          resize(`country:${country}:${metric.key}`)
                        }
                      />
                      {countrySortButton(country, metric)}
                      {metric.key === "activation" && (
                        <span className="inventory-sheet-bulk-controls">
                          <button
                            type="button"
                            aria-label={`Activar en ${sheetLabel(country)}`}
                            title="Activar seleccionados"
                            disabled={
                              busy ||
                              !selectedGroups ||
                              !sheetDirectory?.canEdit ||
                              !countryEvaluation.ready ||
                              countryEvaluation.loading
                            }
                            onClick={() =>
                              void changeSheetActivation(
                                country,
                                visible
                                  .filter((g) =>
                                    g.links.some((a) =>
                                      selectedVisible.includes(a.id),
                                    ),
                                  )
                                  .map((g) => g.name),
                                { active: true },
                              )
                            }
                          >
                            ◉
                          </button>
                          <button
                            type="button"
                            aria-label={`Desactivar en ${sheetLabel(country)}`}
                            title="Desactivar seleccionados"
                            disabled={
                              busy ||
                              !selectedGroups ||
                              !sheetDirectory?.canEdit ||
                              !countryEvaluation.ready ||
                              countryEvaluation.loading
                            }
                            onClick={() =>
                              void changeSheetActivation(
                                country,
                                visible
                                  .filter((g) =>
                                    g.links.some((a) =>
                                      selectedVisible.includes(a.id),
                                    ),
                                  )
                                  .map((g) => g.name),
                                { active: false },
                              )
                            }
                          >
                            ○
                          </button>
                        </span>
                      )}
                    </th>
                  )),
                )}
              </tr>
            )}
          </thead>
          <tbody>
            {sections.map(([key, section]) => {
              // Sections are built from `visible`: never select the whole category directory.
              const sectionIds = section.groups.flatMap((g) =>
                g.links.map((a) => a.id),
              );
              const selectedSectionIds = sectionIds.filter((id) =>
                selected.includes(id),
              );
              const selectedSectionGroups = section.groups.filter((g) =>
                g.links.some((a) => selected.includes(a.id)),
              ).length;
              return (
                <Fragment key={key}>
                  {section.trialTitle && (
                    <tr
                      className="inventory-trial-group-band"
                      data-inventory-trial-group={section.trialTitle}
                    >
                      <th
                        colSpan={Math.max(1, columns.length)}
                        scope="rowgroup"
                      >
                        <div className="inventory-band-heading">
                          <strong>{section.trialTitle}</strong>
                          <small>{section.trialCount} diplomados</small>
                          {section.trialId && (
                            <>
                              <button
                                disabled={!trialDirectory?.canEdit}
                                onClick={() =>
                                  setGroupEditor({
                                    id: section.trialId,
                                    names: [],
                                  })
                                }
                              >
                                Editar grupo
                              </button>
                              <button
                                aria-label={
                                  "Detalle de evaluación de " +
                                  section.trialTitle +
                                  " por país"
                                }
                                onClick={() => setEvaluation(section.trialId!)}
                              >
                                Evaluar por país ↗
                              </button>
                            </>
                          )}
                        </div>
                      </th>
                    </tr>
                  )}
                  <tr
                    hidden={section.hideBand}
                    className={
                      "inventory-group-band" +
                      (section.accent === "blue"
                        ? " inventory-filter-band"
                        : "") +
                      (section.top ? " inventory-top-band" : "")
                    }
                    data-category-group={section.title}
                    data-inventory-top={section.top ? topSheet : undefined}
                  >
                    <th colSpan={Math.max(1, columns.length)} scope="rowgroup">
                      <div className="inventory-band-heading">
                        <InventoryCheck
                          label={`Seleccionar visibles de ${section.title}`}
                          checked={
                            !!sectionIds.length &&
                            selectedSectionIds.length === sectionIds.length
                          }
                          mixed={
                            selectedSectionIds.length > 0 &&
                            selectedSectionIds.length < sectionIds.length
                          }
                          disabled={busy || !sectionIds.length}
                          onChange={(checked) => choose(sectionIds, checked)}
                        />
                        <span
                          className="inventory-band-title"
                          title={section.title}
                        >
                          {section.title}
                        </span>
                        <small>
                          {section.groups.length}{" "}
                          {section.groups.length === 1 ? "ítem" : "ítems"}
                        </small>
                        {!section.top && bandCategorySelector(section)}
                        {selectedSectionGroups > 0 && (
                          <>
                            <small
                              className="inventory-band-selected"
                              role="status"
                            >
                              {selectedSectionGroups} seleccionado
                              {selectedSectionGroups === 1 ? "" : "s"}
                            </small>
                            <button
                              type="button"
                              className="inventory-band-delete"
                              aria-label={`Eliminar seleccionados visibles de ${section.title}`}
                              disabled={busy}
                              onClick={() =>
                                setBulkIds([...selectedSectionIds])
                              }
                            >
                              Eliminar seleccionados ({selectedSectionGroups})
                            </button>
                          </>
                        )}
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
                        g.links.some((a) => selected.includes(a.id)) ||
                        undefined
                      }
                    >
                      <td
                        hidden={!showParameter("inventory")}
                        data-fill-kind="manual"
                      >
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
                      <td
                        hidden={!showParameter("sheets")}
                        data-fill-kind="manual"
                      >
                        <div className="inventory-sheet-toolbar">
                          <div className="inventory-sheet-links">
                            {g.links
                              .filter((a) => !a.standalone)
                              .map((a) => (
                                <span
                                  key={a.id}
                                  className="inventory-sheet-chip"
                                  data-inventory-id={a.id}
                                >
                                  <span
                                    className="inventory-sheet-chip-label"
                                    title={a.tableName}
                                  >
                                    {a.tableName}
                                  </span>
                                  <button
                                    type="button"
                                    className="inventory-remove"
                                    aria-label={`Quitar ${g.name} de ${a.tableName}`}
                                    title={`Quitar vínculo de ${a.tableName}; conservar historial`}
                                    disabled={busy}
                                    onClick={() => setSheetRemoval([a.id])}
                                  >
                                    ×
                                  </button>
                                </span>
                              ))}
                          </div>
                          <InventoryMultiSelect
                            label={`Añadir hojas a ${g.name}`}
                            placeholder="+"
                            compact
                            all={false}
                            values={[]}
                            options={tables
                              .filter(
                                (t) => !g.links.some((a) => a.tableId === t.id),
                              )
                              .map((t) => ({ value: t.id, label: t.name }))}
                            disabled={busy || !categories}
                            description={
                              tables.length === 0
                                ? "Aún no hay hojas creadas."
                                : tables.every((t) =>
                                      g.links.some((a) => a.tableId === t.id),
                                    )
                                  ? "El diplomado ya está vinculado a todas las hojas disponibles."
                                  : "Busca y marca una o varias hojas. Pulsa Listo para añadir este diplomado; sus vínculos actuales se conservan."
                            }
                            onError={setMessage}
                            onChange={async (tableIds) => {
                              if (!tableIds.length || !categories) return;
                              setBusy(true);
                              let committed = false;
                              try {
                                const result = await api(
                                  "meta-ads/inventory/sheets",
                                  "POST",
                                  {
                                    listId,
                                    revision: categories.revision,
                                    inventoryId: g.links[0].id,
                                    expectedName: g.name,
                                    tableIds,
                                  },
                                );
                                committed = true;
                                if (
                                  g.links.some((a) => selected.includes(a.id))
                                )
                                  setSelected((old) => [
                                    ...new Set([...old, ...result.aliasIds]),
                                  ]);
                                await onChanged();
                                await reloadCategories();
                                setMessage(
                                  result.created
                                    ? `«${g.name}» añadido a ${result.created} hoja${result.created === 1 ? "" : "s"}.`
                                    : "El diplomado ya está vinculado a las hojas elegidas.",
                                );
                              } catch (e) {
                                if (committed)
                                  setMessage(
                                    "Las hojas se vincularon. Actualiza para ver todos los cambios.",
                                  );
                                else throw e;
                              } finally {
                                setBusy(false);
                              }
                            }}
                          />
                        </div>
                      </td>
                      <td hidden={!showParameter("group")}>
                        {(() => {
                          const assigned = trialGroupByName.get(
                            categoryKey(g.name),
                          );
                          return assigned ? (
                            <div className="inventory-group-cell">
                              <button
                                disabled={!trialDirectory?.canEdit}
                                onClick={() =>
                                  setGroupEditor({ id: assigned.id, names: [] })
                                }
                              >
                                {assigned.name}
                              </button>
                              <button
                                type="button"
                                className="inventory-remove"
                                aria-label={`Quitar ${assigned.name} de ${g.name}`}
                                title={`Quitar ${assigned.name} de este diplomado`}
                                disabled={!trialDirectory?.canEdit || busy}
                                onClick={() =>
                                  void removeGroupMembers([
                                    {
                                      groupId: assigned.id,
                                      revision: assigned.revision,
                                      itemIds: assigned.members
                                        .filter(
                                          (m) =>
                                            categoryKey(
                                              trialItemsById.get(m.itemId)
                                                ?.name ?? m.name,
                                            ) === categoryKey(g.name),
                                        )
                                        .map((m) => m.itemId),
                                    },
                                  ])
                                }
                              >
                                ×
                              </button>
                              <button
                                aria-label={
                                  "Detalle de evaluación de " +
                                  assigned.name +
                                  " por país"
                                }
                                onClick={() => setEvaluation(assigned.id)}
                              >
                                Evaluar ↗
                              </button>
                            </div>
                          ) : (
                            <InventoryGroupSelect
                              groups={trialGroups}
                              label={"Asignar grupo a " + g.name}
                              disabled={!trialDirectory?.canEdit || busy}
                              onSelect={(id) =>
                                assignGroupDirectly(id, [g.name])
                              }
                            />
                          );
                        })()}
                      </td>
                      {hasCountryColumns && (
                        <InventoryCountryCells
                          canEdit={!!sheetDirectory?.canEdit}
                          busy={busy}
                          name={g.name}
                          countries={countryCodes}
                          hiddenColumns={hiddenColumnKeys}
                          evaluation={countryEvaluation}
                          sheetLabel={sheetLabel}
                          onReplace={(tableId, name) =>
                            setGroupEditor({
                              names: [],
                              tab: "top",
                              column: tableId,
                              replaceName: name,
                            })
                          }

                          onChange={(tableId, name, change) =>
                            void changeSheetActivation(tableId, [name], change)
                          }
                          onDetail={(column, name, aliasId) =>
                            aliasId
                              ? setFullDetail({
                                  tableId: column.split(":")[0],
                                  country: column.split(":")[1],
                                  name,
                                  aliasId,
                                })
                              : setActivationHistory({ tableId: column, name })
                          }
                          onHistory={(tableId, name) =>
                            setActivationHistory({ tableId, name })
                          }
                        />
                      )}
                      <td
                        hidden={!columns.some((c) => c.key === "gap")}
                        aria-hidden="true"
                        className="inventory-column-gap"
                      />
                      <td
                        hidden={!showParameter("syllabi")}
                        className="inventory-syllabi-cell"
                      >
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
              );
            })}
          </tbody>
          <tfoot>
            {newRowOpen && (
              <InventoryNewRow
                visibleParameters={parameters}
                countryColumnCount={
                  columns.filter((column) => column.key.startsWith("country:"))
                    .length
                }
                directory={directoryNames}
                tables={tables}
                disabled={busy}
                onSave={saveNewRow}
                onCancel={() => setNewRowOpen(false)}
              />
            )}
            <tr className="inventory-add-row">
              <td colSpan={Math.max(1, columns.length)}>
                <button
                  type="button"
                  disabled={
                    busy ||
                    !categories ||
                    newRowOpen ||
                    !showParameter("inventory")
                  }
                  onClick={() => setNewRowOpen(true)}
                >
                  + Agregar fila
                </button>
              </td>
            </tr>
          </tfoot>
        </table>
        {!columns.length && (
          <p className="sheet-help">
            Elige las columnas que quieres mostrar en «Ver parámetros».
          </p>
        )}
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
      {sheetRemoval && (
        <InventorySelectionDelete
          listId={listId}
          ids={sheetRemoval}
          sheetsOnly
          onClose={() => setSheetRemoval(null)}
          onRemoved={async () => {
            await onChanged();
            await reloadCategories();
            await reloadGroups();
            setSelected([]);
            setSheetRemoval(null);
            setMessage("Hojas retiradas de los seleccionados.");
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
