"use client";
import {
  SheetHorizontalNavigation,
  horizontalSheetKey,
} from "./sheet-horizontal-navigation";
import {
  FinancialTableWindow,
  FinancialTableWindowControls,
  type FinancialTableWindowMode,
} from "./financial-table-window";
import { SheetSalesDetail } from "./sheet-sales-detail";
import { SheetDataFillBadge } from "./sheet-data-fill-badge";
import {
  sheetMetricDataFill,
  sheetDataFillLabels,
} from "../../lib/meta-ads/sheet-data-fill";
import type { PeriodTableLink } from "../../lib/meta-ads/period-table-link";
import {
  notifyAdvisorSalesChanged,
  subscribeAdvisorSalesChanged,
} from "./advisor-sales-events";
import { AdvisorSalesApproval } from "./advisor-sales-approval";
import { DeleteEffectivenessRows } from "./delete-effectiveness-rows";
import {
  activePeriodWindow,
  type ActivePeriod,
} from "../../lib/meta-ads/active-periods";
import { useFinancialCategories } from "./use-financial-categories";
import {
  groupFinancialRows,
  groupFinancialRowsByAdvisor,
  financialRowCategories,
  type FinancialCatalogEntry,
} from "../../lib/meta-ads/financial-categories";
import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { financialRequest as api } from "./financial-request";
import { countryOptions } from "../../lib/meta-ads/countries";
import {
  parseEffectivenessPaste,
  resolveCountry,
} from "../../lib/meta-ads/effectiveness-paste";
import { MetaDateRange } from "./meta-date-range";
import { currencyCodes, isCurrency } from "../../lib/meta-ads/currency-codes";
import {
  sheetMetrics,
  compareSheetNumbers,
  type SheetMetric,
} from "../../lib/meta-ads/period-summary";
import { SheetSearchSelect } from "./sheet-search-select";
import { SheetMultiFilter } from "./sheet-multi-filter";
import { useInventoryPinnedColumns } from "./use-inventory-pinned-columns";
import { InventoryRowPinIcon } from "./inventory-country-evaluation";
import { InventoryStatusLabel } from "./inventory-status-label";
import type { FinancialCatalogStatus } from "../../lib/meta-ads/inventory-sheet-activation";
import { InventoryMultiSelect } from "./inventory-multi-select";
import { useWorkbookPreference } from "./use-workbook-preference";
import { useInventoryDuplicateReview } from "./inventory-duplicate-review";
import type { InventoryCategoryState } from "./inventory-category-types";
import { SheetColumnResizer } from "./sheet-column-resizer";
import { SheetSizedRow } from "./sheet-sized-row";
import { useSheetHeights } from "./use-sheet-heights";
import { useSheetWidths } from "./use-sheet-widths";
import { EffectivenessSync } from "./effectiveness-sync";
import { EffectivenessHistory } from "./effectiveness-history";
import { useSheetTextFit } from "./use-sheet-text-fit";
import { SheetActiveFill } from "./sheet-active-fill";
import { SheetColorsControl } from "./sheet-colors-control";
import {
  sheetCellColor,
  type SheetColorRule,
} from "../../lib/meta-ads/sheet-colors";
import { AdvisorBulkAssignment } from "./advisor-bulk-assignment";
import { AdvisorAssignment } from "./advisor-assignment";
import type { AdvisorPeriodView } from "../../lib/meta-ads/advisor-period-history";
import { AdvisorDetail } from "./advisor-detail";
import { EffectivenessCell } from "./effectiveness-cell";
const countries = countryOptions.map((c) => ({
  value: c.code,
  label: `${c.code} · ${c.name}`,
}));
const currencyNames = new Intl.DisplayNames(["es"], { type: "currency" });
const currencies = currencyCodes.map((c) => ({
  value: c,
  label: `${c} · ${currencyNames.of(c) || c}`,
}));
type Cell = {
  budget: number | null;
  spend: number | null;
  base: number | null;
  sales: number | null;
  fixedCost: number | null;
  campaigns: number;
  updatedAt: string | null;
  revision: number;
  sourceSpend: { currency: string; amount: number }[];
  sourceFixedCost: { currency: string; amount: number }[];
  fxMissing: boolean;
  na: SheetMetric[];
  automaticNa?: SheetMetric[];
  manual: SheetMetric[];
  synced?: Partial<Record<SheetMetric, string>>;
  partialMetrics?: SheetMetric[];
  linked?: Partial<
    Record<SheetMetric, { tableId: string; name: string; matched: boolean }>
  >;
  fx: {
    from: string;
    to: string;
    rate: number;
    date: string;
    source: string;
    url: string;
  }[];
};
type Row = {
  aliasId: string;
  advisorId: string | null;
  country: string;
  currency: string;
  rowRevision: number;
  active: boolean;
  stateRevision: number;
  lastStateChange: string | null;
  pendingAssignmentAt?: string;
  campaignTask?: "NONE" | "CREATE" | "STOP";
  token: string;
  advisorChanges?: Record<
    string,
    { status: "PENDING" | "APPROVED" | "AUTOMATIC" }
  >;
  days: Record<string, Cell>;
  campaigns: number;
  timezones: string[];
};
const activationKey = (r: Pick<Row, "aliasId" | "country">) =>
  JSON.stringify([r.aliasId, r.country]);
type Settings = {
  aliasColumnName: string;
  defaultCountry: string;
  defaultCurrency: string;
};
type SheetSort =
  | {
      kind: "text";
      field: "alias" | "country" | "currency";
      direction: "asc" | "desc";
    }
  | {
      kind: "day";
      metric: SheetMetric;
      day: string;
      direction: "asc" | "desc";
    };
type Data = {
  columnLink?: {
    sourceTableId: string;
    sourceName: string;
    columns: SheetMetric[];
    since: string | null;
    until: string | null;
  } | null;
  rows: Row[];
  table: Settings & { aliases?: FinancialCatalogEntry[] };
  missingFxDays: string[];
};
export function MetaEffectiveness({
  tableId,
  aliases,
  onNamesChanged,
  onPresenceChanged,
  settings,
  view,
  onViewChange,
  onChooseTable,
  tableWindowMode,
  onTableWindowModeChange,
  tables,
  sheetTabs,
  advisors,
  inventoryLists,
  onOpenAdvisorPeriod,
  advisorPeriodRequest,
  onAdvisorPeriodHandled,
  initialPeriodLink,
}: {
  initialPeriodLink?: PeriodTableLink | null;
  inventoryLists: { id: string; name: string }[];
  onOpenAdvisorPeriod?: (period: AdvisorPeriodView) => void;
  advisorPeriodRequest?: { key: number; period: AdvisorPeriodView } | null;
  onAdvisorPeriodHandled?: () => void;
  sheetTabs: ReactNode;
  advisors: { id: string; name: string; label?: string }[];
  tables: {
    id: string;
    name: string;
    aliases: { id: string; name: string; inventorySheetId?: string }[];
  }[];
  view: "manual" | "automatic";
  onViewChange: (view: "manual" | "automatic") => void;
  onChooseTable: (id: string) => void;
  tableWindowMode: FinancialTableWindowMode;
  onTableWindowModeChange: (mode: FinancialTableWindowMode) => void;
  tableId: string;
  settings: Settings;
  aliases: { id: string; name: string }[];
  onNamesChanged: () => Promise<void>;
  onPresenceChanged: (tableId: string, count: number) => void;
}) {
  const sheetName = tables.find((t) => t.id === tableId)?.name ?? "Hoja";
  const [sheetSalesDetailOpen, setSheetSalesDetailOpen] = useState(false);
  const inventoryColumnName =
    settings.aliasColumnName.trim().toLowerCase() === "alias"
      ? "Inventario"
      : settings.aliasColumnName;
  const rowsLayout = useSheetHeights("financial:" + tableId);
  const temporaryCategories = useFinancialCategories(tableId);
  const [salesReview, setSalesReview] = useState<{
    aliasId: string;
    country: string;
    day: string;
  } | null>(null);
  const [syncOpen, setSyncOpen] = useState(false);
  const [assignment, setAssignment] = useState<{
    row: Row;
    advisorId: string | null;
    name: string;
  } | null>(null);
  const [bulkAdvisor, setBulkAdvisor] = useState<{
    advisorId: string | null;
    name: string;
    selected: Row[];
    visible: Row[];
  } | null>(null);
  const [newAssignment, setNewAssignment] = useState<string | null>(null);
  const [newTiming, setNewTiming] = useState<{
    day: string;
    mode: "DAY" | "CLOCK";
    time?: string;
  } | null>(null);
  const [detailVersion, setDetailVersion] = useState(0);
  const [advisorDetail, setAdvisorDetail] = useState<{
    id: string;
    name: string;
    aliasId: string;
    country: string;
  } | null>(null);
  const [colorRules, setColorRules] = useState<SheetColorRule[]>([]);
  const duplicateReview = useInventoryDuplicateReview();
  const [inventoryPreference, setInventoryPreference] =
    useWorkbookPreference<string>(tableId, "inventory-source", "");
  const inventoryId = inventoryLists.some((s) => s.id === inventoryPreference)
    ? inventoryPreference
    : (inventoryLists[0]?.id ?? "");
  const [inventoryState, setInventoryState] =
    useState<InventoryCategoryState | null>(null);
  const [inventoryError, setInventoryError] = useState("");
  useEffect(() => {
    let cancelled = false;
    setInventoryState(null);
    setInventoryError("");
    if (inventoryId)
      void api(
        "meta-ads/inventory/categories?listId=" +
          encodeURIComponent(inventoryId),
      )
        .then((state) => {
          if (!cancelled) setInventoryState(state as InventoryCategoryState);
        })
        .catch((e) => {
          if (!cancelled)
            setInventoryError(
              e instanceof Error
                ? e.message
                : "No se pudo cargar el inventario.",
            );
        });
    return () => {
      cancelled = true;
    };
  }, [inventoryId, aliases]);
  const inventoryNames = [
    ...new Set([
      ...(inventoryState?.listId === inventoryId
        ? (inventoryState.items ?? [])
        : []
      ).map((i) => i.name),
      ...tables.flatMap((t) =>
        t.aliases
          .filter((a) => a.inventorySheetId === inventoryId)
          .map((a) => a.name),
      ),
    ]),
  ].sort((a, b) => a.localeCompare(b, "es"));
  const [selectedPairs, setSelectedPairs] = useState<string[]>([]);
  const [rowDeletion, setRowDeletion] = useState<{
    tableId: string;
    since: string;
    until: string;
    targets: { aliasId: string; country: string }[];
  } | null>(null);
  const horizontalScroll = useRef<HTMLDivElement>(null);
  const metadataColumns = [
    { value: "alias", label: "Inventario" },
    { value: "country", label: "País" },
    { value: "advisor", label: "Asesor" },
    { value: "currency", label: "Moneda" },
    { value: "evaluation", label: "Estado" },
  ];
  const [metadataVisible, setMetadataVisible] = useWorkbookPreference<string[]>(
    tableId,
    "metadata-visible",
    ["alias", "country", "advisor", "currency", "evaluation"],
  );
  const [metadataPins, setMetadataPins] = useWorkbookPreference<string[]>(
    tableId,
    "metadata-pins",
    ["alias", "country"],
  );
  const visibleMetadata = metadataColumns.filter((c) =>
    metadataVisible.includes(c.value),
  );
  const grid = useInventoryPinnedColumns(
    metadataPins.filter((k) => metadataVisible.includes(k)),
  );
  const [catalogStatus, setCatalogStatus] =
    useState<FinancialCatalogStatus | null>(null);
  const [catalogStatusError, setCatalogStatusError] = useState("");
  const statusLookup = useMemo(
    () =>
      new Map(
        catalogStatus?.rows.map((r) => [
          JSON.stringify([r.aliasId, r.country]),
          r.assessment,
        ]) ?? [],
      ),
    [catalogStatus],
  );
  const metadataControls = (key: string, label: string) => (
    <span className="financial-column-tools">
      <button
        type="button"
        data-pin-keys={key}
        aria-label={`${metadataPins.includes(key) ? "Desfijar" : "Fijar"} columna ${label}`}
        title={`${metadataPins.includes(key) ? "Desfijar" : "Fijar"} columna ${label}`}
        aria-pressed={metadataPins.includes(key)}
        onClick={() =>
          setMetadataPins((old) =>
            old.includes(key) ? old.filter((v) => v !== key) : [...old, key],
          )
        }
      >
        <InventoryRowPinIcon />
      </button>
      <button
        type="button"
        aria-label={`Ocultar columna ${label}`}
        title={`Ocultar columna ${label}`}
        onClick={() =>
          setMetadataVisible((old) => old.filter((v) => v !== key))
        }
      >
        −
      </button>
    </span>
  );
  useSheetTextFit(grid);
  const {
    widths: columnWidths,
    resize: resizeColumn,
    warning: widthWarning,
  } = useSheetWidths(tableId);
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const [since, setSince] = useState(
      today.slice(0, 8) + (Number(today.slice(8)) >= 20 ? "20" : "01"),
    ),
    [until, setUntil] = useState(today),
    [country, setCountry] = useState(""),
    [data, setData] = useState<Data | null>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [paste, setPaste] = useState<string | null>(null),
    [pasteCountry, setPasteCountry] = useState(settings.defaultCountry),
    [pasteCurrency, setPasteCurrency] = useState(settings.defaultCurrency),
    [csv, setCsv] = useState(false);
  useEffect(() => {
    if (data)
      onPresenceChanged(
        tableId,
        new Set(data.rows.map((row) => row.aliasId)).size,
      );
  }, [data, tableId, onPresenceChanged]);
  useEffect(() => {
    let alive = true;
    setCatalogStatus(null);
    setCatalogStatusError("");
    if (data)
      void api(
        "meta-ads/effectiveness/catalog-status?" +
          new URLSearchParams({ tableId }),
      )
        .then((result: FinancialCatalogStatus) => {
          if (alive) setCatalogStatus(result);
        })
        .catch((e: Error) => {
          if (alive) setCatalogStatusError(e.message);
        });
    return () => {
      alive = false;
    };
  }, [tableId, data]);
  const [historyPeriod, setHistoryPeriod] = useState<null | {
    name: string;
    heading?: string;
    detail?: string;
    aliasId: string;
    country: string;
    since: string;
    through: string;
    previous: {
      since: string;
      until: string;
      country: string;
      aliases: string[] | null;
      values: string[] | null;
      state: string;
      metrics: { manual: string[] | null; automatic: string[] | null };
    };
  }>(null);
  const [reportRange, setReportRange] = useState<{
    since: string;
    until: string;
  } | null>(null);
  const reportWindow = reportRange
    ? activePeriodWindow(reportRange.since, reportRange.until, since)
    : null;
  useEffect(() => {
    const p = initialPeriodLink;
    if (!p || p.tableId !== tableId) return;
    const w = activePeriodWindow(p.since, p.until);
    setReportRange(w.next ? { since: p.since, until: p.until } : null);
    setSince(w.since);
    setUntil(w.until);
    setCountry(p.focus ? "" : p.country);
    setSelectedAliases(!p.focus && p.aliasId ? [p.aliasId] : null);
    setStateFilter("");
    setValueFilter(null);
    setSelectedMetrics(null);
  }, [initialPeriodLink, tableId]);
  useEffect(() => {
    const p = initialPeriodLink;
    if (!p?.focus || p.tableId !== tableId || !data) return;
    const frame = requestAnimationFrame(() => {
      const row = document.querySelector<HTMLElement>(
        `.effectiveness-grid tr[data-alias-id=${JSON.stringify(p.aliasId)}][data-country=${JSON.stringify(p.country)}]`,
      );
      row?.scrollIntoView({ block: "center", inline: "nearest" });
    });
    return () => cancelAnimationFrame(frame);
  }, [initialPeriodLink, tableId, data]);
  const [grouping, setGrouping] = useWorkbookPreference<
    "inventory" | "advisor"
  >(tableId, "financialGrouping", "inventory");
  const [newActive, setNewActive] = useState(false);
  const [newName, setNewName] = useState(""),
    [newCountry, setNewCountry] = useState(settings.defaultCountry),
    [newAdvisor, setNewAdvisor] = useState(""),
    [newCurrency, setNewCurrency] = useState(settings.defaultCurrency);
  const [metricsByView, setMetricsByView] = useState<{
    manual: string[] | null;
    automatic: string[] | null;
  }>({ manual: null, automatic: null });
  const selectedMetrics = metricsByView[view];
  const setSelectedMetrics = (value: string[] | null) =>
    setMetricsByView((old) => ({ ...old, [view]: value }));
  const [selectedAliases, setSelectedAliases] = useState<string[] | null>(null),
    [sheetSort, setSheetSort] = useState<SheetSort>({
      kind: "text",
      field: "alias",
      direction: "asc",
    });
  const [valueFilter, setValueFilter] = useState<string[] | null>(null),
    [stateFilter, setStateFilter] = useState("");
  const viewMetrics = sheetMetrics.filter(
    (m) =>
      m.key !== "fixedCost" &&
      (view === "manual"
        ? m.key === "sales" || m.key === "budget"
        : m.key !== "budget"),
  );
  const visibleMetrics = viewMetrics.filter(
    (m) =>
      selectedMetrics === null ||
      (selectedMetrics.length > 0 &&
        selectedMetrics.every((key) => key === "fixedCost")) ||
      selectedMetrics.includes(m.key),
  );
  const visibleMetricKeys = new Set(visibleMetrics.map((m) => m.key));
  const currentRange = useRef(""),
    queryVersion = useRef(0),
    attemptedFx = useRef(new Set<string>());
  const valid =
    !!since &&
    !!until &&
    since <= until &&
    (Date.parse(until) - Date.parse(since)) / 86400000 < 31;
  const query = `meta-ads/effectiveness?${new URLSearchParams({ tableId, since, until })}`;
  useEffect(() => {
    if (!valid) return;
    let active = true;
    if (currentRange.current !== query) {
      setData(null);
      currentRange.current = query;
    }
    const load = () => {
      if (document.hidden) return;
      const version = ++queryVersion.current;
      void api(query)
        .then((v: Data) => {
          if (active && queryVersion.current === version) setData(v);
          const days = v.missingFxDays.filter(
            (d) => !attemptedFx.current.has(d),
          );
          if (days.length) {
            days.forEach((d) => attemptedFx.current.add(d));
            void api("meta-ads/effectiveness/fx", "POST", { days })
              .then(() => {
                if (active) load();
              })
              .catch((e) => {
                if (active) setMessage(e.message);
              });
          }
        })
        .catch((e) => {
          if (active) setMessage(e.message);
        });
    };
    load();
    const timer = setInterval(load, 30000);
    const unsubscribe = subscribeAdvisorSalesChanged(load);
    return () => {
      active = false;
      clearInterval(timer);
      unsubscribe();
    };
  }, [query, valid]);
  const refresh = async () => {
    const version = ++queryVersion.current;
    const v: Data = await api(query);
    if (queryVersion.current === version && currentRange.current === query)
      setData(v);
    const days = v.missingFxDays.filter((d) => !attemptedFx.current.has(d));
    if (days.length) {
      days.forEach((d) => attemptedFx.current.add(d));
      void api("meta-ads/effectiveness/fx", "POST", { days })
        .then(async () => {
          if (currentRange.current !== query) return;
          const seq = ++queryVersion.current;
          const next: Data = await api(query);
          if (queryVersion.current === seq) setData(next);
        })
        .catch((e) => setMessage(e.message));
    }
  };
  const mutate = async (
    path: string,
    method: string,
    body: unknown,
    names = false,
  ) => {
    await api(path, method, body);
    notifyAdvisorSalesChanged();
    try {
      if (names) await onNamesChanged();
      await refresh();
      setMessage("");
    } catch {
      throw Error(
        "Guardado, pero no se pudo recargar la tabla. Actualiza la página antes de seguir editando.",
      );
    }
  };
  const fill = async (
    targets: Row[],
    metrics: SheetMetric[],
    value: number | "NA" | null,
    onlyDays?: string[],
    allActive = false,
  ) => {
    if (!targets.length || !metrics.length) return;
    await mutate("meta-ads/effectiveness/cells", "PATCH", {
      tableId,
      since,
      until,
      metrics,
      value,
      ...(onlyDays ? { days: onlyDays } : {}),
      ...(allActive ? { allActive: true } : {}),
      targets: targets.map((r) => ({
        aliasId: r.aliasId,
        country: r.country,
        token: r.token,
      })),
    });
  };
  const fillVisible = async (value: 0 | "NA" | null) => {
    setBusy(true);
    try {
      await fill(
        rows,
        visibleMetrics.map((m) => m.key),
        value,
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "No se pudo completar.");
    } finally {
      setBusy(false);
    }
  };
  const toggleState = async (r: Row) => {
    setBusy(true);
    try {
      await mutate("meta-ads/effectiveness/state", "PATCH", {
        tableId,
        aliasId: r.aliasId,
        country: r.country,
        active: !r.active,
        revision: r.stateRevision,
        since,
        until,
        metrics: visibleMetrics.map((m) => m.key),
      });
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "No se pudo cambiar el estado.",
      );
    } finally {
      setBusy(false);
    }
  };
  const editCell = (r: Row, day: string, metric: SheetMetric, text: string) => {
    const na = /^n\.?a\.?$/i.test(text.trim());
    if (na) return fill([r], [metric], "NA", [day]);
    const value = text.trim() === "" ? null : Number(text);
    if (
      value !== null &&
      (!Number.isFinite(value) ||
        value < 0 ||
        value >
          (metric === "sales" || metric === "base" ? 100000000 : 1000000000) ||
        ((metric === "sales" || metric === "base") && !Number.isInteger(value)))
    )
      return Promise.reject(
        Error("Escribe un número válido no negativo o N.A."),
      );
    if (metric === "sales" || metric === "fixedCost")
      return manual(r, day, metric, value === null ? "" : String(value));
    return fill([r], [metric], value, [day]);
  };
  const columns = async (
    change: Partial<{
      aliasColumnName: string;
      country: string;
      currency: string;
    }>,
  ) => {
    await mutate(
      "meta-ads/effectiveness/columns",
      "PATCH",
      { tableId, ...change },
      true,
    );
    if (change.country !== undefined) {
      setNewCountry(change.country);
      setPasteCountry(change.country);
    }
    if (change.currency !== undefined) {
      setNewCurrency(change.currency);
      setPasteCurrency(change.currency);
    }
  };
  const identity = async (
    r: Row,
    field: "country" | "currency",
    value: string,
  ) => {
    const code = field === "country" ? resolveCountry(value) : r.country;
    if (code === null)
      throw Error("País no reconocido. Escribe PE, Perú o elige una opción.");
    const currency = field === "currency" ? value.toUpperCase() : r.currency;
    if (!isCurrency(currency))
      throw Error(
        "Moneda no válida: usa PEN, USD, ARS u otro código de 3 letras.",
      );
    await mutate("meta-ads/effectiveness/identity", "PATCH", {
      aliasId: r.aliasId,
      fromCountry: r.country,
      fromCurrency: r.currency,
      country: code,
      currency,
      revision: r.rowRevision,
    });
  };
  const manualQueues = useRef(new Map<string, Promise<void>>());
  const manualVersions = useRef(new Map<string, number>());
  const manual = (
    r: Row,
    day: string,
    field: "sales" | "fixedCost",
    value: string,
  ) => {
    const c = r.days[day],
      key = JSON.stringify([
        r.aliasId,
        r.country,
        r.currency,
        r.rowRevision,
        day,
      ]);
    const previous = manualQueues.current.get(key) ?? Promise.resolve();
    const job = previous
      .catch(() => {})
      .then(async () => {
        const revision = Math.max(
          c?.revision ?? 0,
          manualVersions.current.get(key) ?? 0,
        );
        await api("meta-ads/effectiveness", "PATCH", {
          aliasId: r.aliasId,
          country: r.country,
          currency: r.currency,
          day,
          [field]: value === "" ? null : Number(value),
          revision,
          rowRevision: r.rowRevision,
        });
        manualVersions.current.set(key, revision + 1);
        notifyAdvisorSalesChanged();
        try {
          await refresh();
          setMessage("");
        } catch {
          throw Error(
            "Guardado, pero no se pudo recargar la tabla. Actualiza la página antes de seguir editando.",
          );
        }
      });
    manualQueues.current.set(key, job);
    return job.finally(() => {
      if (manualQueues.current.get(key) === job)
        manualQueues.current.delete(key);
    });
  };
  const importRows = async () => {
    setBusy(true);
    setMessage("");
    try {
      const code = resolveCountry(pasteCountry);
      if (code === null)
        throw Error("Selecciona un país válido o déjalo vacío.");
      const rows = parseEffectivenessPaste(
        paste ?? "",
        code,
        pasteCurrency,
        csv,
      );
      const result = await api("meta-ads/effectiveness/import", "POST", {
        tableId,
        rows,
      });
      await onNamesChanged();
      await refresh();
      setPaste(null);
      setMessage(
        `${result.rows} filas listas; ${result.created} elementos nuevos de inventario.`,
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "No se pudo importar.");
    } finally {
      setBusy(false);
    }
  };
  const openPaste = (text: string) => {
    if (!/[\n\t]/.test(text)) return false;
    setCsv(false);
    setPaste(text);
    return true;
  };
  const addRow = async (name = newName) => {
    if (
      !name.trim() ||
      busy ||
      !inventoryId ||
      inventoryState?.listId !== inventoryId
    )
      return;
    setBusy(true);
    setMessage("");
    try {
      const code = resolveCountry(newCountry);
      if (code === null) throw Error("País no reconocido.");
      const rows = parseEffectivenessPaste(name, code, newCurrency);
      if (newAdvisor && rows.some((r) => !r.country))
        throw Error("Elige el país antes de guardar el inventario con asesor.");
      const decisions = await duplicateReview.review(
        rows.map((r) => ({ kind: "INVENTORY", name: r.name })),
        inventoryNames.map((name) => ({ kind: "INVENTORY", name })),
      );
      if (!decisions) return;
      await mutate(
        "meta-ads/effectiveness/import",
        "POST",
        {
          tableId,
          rows,
          inventorySheetId: inventoryId,
          decisions,
          ...(code ? { initialActive: newActive } : {}),
          ...(newAdvisor
            ? {
                advisorId: newAdvisor,
                ...(newTiming ? { advisorTiming: newTiming } : {}),
              }
            : {}),
        },
        true,
      );
      setNewName("");
      setNewActive(false);
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "No se pudo agregar la fila.",
      );
    } finally {
      setBusy(false);
    }
  };
  const days = useMemo(() => {
    const result: string[] = [];
    if (valid)
      for (let d = Date.parse(since); d <= Date.parse(until); d += 86400000)
        result.push(new Date(d).toISOString().slice(0, 10));
    return result;
  }, [since, until, valid]);
  const financialAliases = data?.table.aliases ?? aliases;
  const names = useMemo(
    () => new Map(financialAliases.map((a) => [a.id, a.name])),
    [financialAliases],
  );
  const activeSort: SheetSort =
    sheetSort.kind === "day" &&
    (sheetSort.day < since ||
      sheetSort.day > until ||
      !visibleMetricKeys.has(sheetSort.metric))
      ? { kind: "text", field: "alias", direction: "asc" }
      : sheetSort;
  const rows = (data?.rows ?? [])
    .filter(
      (r) =>
        (country === "__none"
          ? !r.country
          : !country || r.country === country) &&
        (selectedAliases === null || selectedAliases.includes(r.aliasId)) &&
        (!stateFilter || (stateFilter === "active" ? r.active : !r.active)) &&
        (valueFilter === null ||
          days.some((day) =>
            visibleMetrics.some((m) => {
              const c = r.days[day],
                v = c?.[m.key];
              return (
                (valueFilter.includes("na") && c?.na?.includes(m.key)) ||
                (!c?.na?.includes(m.key) &&
                  ((valueFilter.includes("zero") && v === 0) ||
                    (valueFilter.includes("positive") &&
                      typeof v === "number" &&
                      v > 0)))
              );
            }),
          )),
    )
    .sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1;
      let result = 0;
      if (activeSort.kind === "text") {
        const av =
            activeSort.field === "alias"
              ? (names.get(a.aliasId) ?? "")
              : a[activeSort.field],
          bv =
            activeSort.field === "alias"
              ? (names.get(b.aliasId) ?? "")
              : b[activeSort.field];
        result = av.localeCompare(bv, "es", { numeric: true });
        if (activeSort.direction === "desc") result = -result;
      } else {
        const metric = activeSort.metric,
          av = a.days[activeSort.day]?.[metric] ?? null,
          bv = b.days[activeSort.day]?.[metric] ?? null,
          money =
            metric === "budget" || metric === "spend" || metric === "fixedCost";
        result = compareSheetNumbers(
          av,
          bv,
          activeSort.direction,
          money ? a.currency : "",
          money ? b.currency : "",
        );
      }
      return (
        result ||
        (names.get(a.aliasId) ?? "").localeCompare(
          names.get(b.aliasId) ?? "",
          "es",
        ) ||
        a.country.localeCompare(b.country)
      );
    });
  const pendingAssignmentRows = rows
    .filter(
      (r) =>
        r.campaignTask === "CREATE" ||
        (!!r.pendingAssignmentAt && (!r.advisorId || !r.currency)),
    )
    .sort(
      (a, b) =>
        Number(b.campaignTask === "CREATE") -
          Number(a.campaignTask === "CREATE") ||
        (b.pendingAssignmentAt ?? "").localeCompare(
          a.pendingAssignmentAt ?? "",
        ),
    );
  const pendingAssignmentKeys = new Set(
    pendingAssignmentRows.map(activationKey),
  );
  const normalRows = rows.filter(
    (r) => !pendingAssignmentKeys.has(activationKey(r)),
  );
  const advisorSections =
    grouping === "advisor"
      ? groupFinancialRowsByAdvisor(
          normalRows,
          financialAliases,
          temporaryCategories.temporary,
          advisors,
        )
      : [];
  const categoryBands =
    grouping === "advisor"
      ? advisorSections.flatMap((g) => g.bands)
      : groupFinancialRows(
          normalRows,
          financialAliases,
          temporaryCategories.temporary,
        );
  const showCategoryBands = financialAliases.some(
    (a) => (a as FinancialCatalogEntry).categoryAssignments?.length,
  );
  const normalDisplayedRows =
    grouping === "advisor"
      ? advisorSections.flatMap((g) =>
          showCategoryBands ? g.bands.flatMap((b) => b.rows) : g.rows,
        )
      : showCategoryBands
        ? categoryBands.flatMap((b) => b.rows)
        : normalRows;
  const displayedRows = [...pendingAssignmentRows, ...normalDisplayedRows];
  const firstAdvisorBands = new Map(
    grouping === "advisor"
      ? advisorSections.map((g) => {
          const ordered = showCategoryBands
            ? g.bands.flatMap((b) => b.rows)
            : g.rows;
          return [activationKey(ordered[0]), g] as const;
        })
      : [],
  );
  const inactiveSections =
    grouping === "advisor"
      ? advisorSections.map((g) =>
          g.bands.flatMap((b) => b.rows).filter((r) => !r.active),
        )
      : [normalDisplayedRows.filter((r) => !r.active)];
  const firstInactiveBands = new Map(
    inactiveSections
      .filter((g) => g.length)
      .map((g) => [activationKey(g[0]), g.length]),
  );
  const firstBands = new Map(
    categoryBands
      .filter((b) => b.rows.length)
      .map((b) => [activationKey(b.rows[0]), b]),
  );
  const linkedColumn = (metric: SheetMetric, day: string) =>
    !!data?.columnLink &&
    data.columnLink.columns.includes(metric) &&
    (!data.columnLink.since || day >= data.columnLink.since) &&
    (!data.columnLink.until || day <= data.columnLink.until);
  const hasLinkedVisibleColumns = visibleMetrics.some((m) =>
    days.some((day) => linkedColumn(m.key, day)),
  );
  const historyWindow = historyPeriod
    ? activePeriodWindow(historyPeriod.since, historyPeriod.through, since)
    : null;
  const openActivePeriod = (
    period: ActivePeriod,
    row: Pick<Row, "aliasId" | "country">,
    name: string,
  ) => {
    setReportRange(null);
    setHistoryPeriod({
      name,
      aliasId: row.aliasId,
      country: row.country,
      since: period.since,
      through: period.through,
      previous: historyPeriod?.previous ?? {
        since,
        until,
        country,
        aliases: selectedAliases,
        values: valueFilter,
        state: stateFilter,
        metrics: metricsByView,
      },
    });
    const page = activePeriodWindow(period.since, period.through);
    setSince(page.since);
    setUntil(page.until);
    setSelectedAliases([row.aliasId]);
    setCountry(row.country);
    setStateFilter("");
    setValueFilter(null);
    setSelectedMetrics(null);
    setSyncOpen(false);
    setMessage("");
  };
  useEffect(() => {
    const p = advisorPeriodRequest?.period;
    if (!p || p.tableId !== tableId || !p.from || !p.since) return;
    openActivePeriod(
      {
        id: p.id,
        from: p.from,
        until: p.until,
        since: p.since,
        through: p.through,
      },
      { aliasId: p.aliasId, country: p.country },
      `${p.advisorName} · ${p.alias}`,
    );
    setAdvisorDetail(null);
    setHistoryPeriod((old) =>
      old
        ? {
            ...old,
            heading:
              p.kind === "SALES_DAY"
                ? "Registro de ventas"
                : "Asignación de asesor",
            detail:
              "V muestra la sumatoria diaria del ítem. Consulta Estadísticas del asesor para su cantidad exacta.",
          }
        : old,
    );
    onAdvisorPeriodHandled?.();
  }, [advisorPeriodRequest?.key, tableId]);
  const closeActivePeriod = () => {
    if (!historyPeriod) return;
    const old = historyPeriod.previous;
    setSince(old.since);
    setUntil(old.until);
    setCountry(old.country);
    setSelectedAliases(old.aliases);
    setValueFilter(old.values);
    setStateFilter(old.state);
    setMetricsByView(old.metrics);
    setHistoryPeriod(null);
  };
  const pageActivePeriod = (first: string) => {
    if (!historyPeriod) return;
    const page = activePeriodWindow(
      historyPeriod.since,
      historyPeriod.through,
      first,
    );
    setSince(page.since);
    setUntil(page.until);
  };
  const selectedPairSet = new Set(selectedPairs),
    eligibleRows = rows;
  const selectedVisibleRows = eligibleRows.filter((r) =>
    selectedPairSet.has(activationKey(r)),
  );
  const allVisibleSelected =
    eligibleRows.length > 0 &&
    selectedVisibleRows.length === eligibleRows.length;
  const choosePairs = (next: string[]) => {
    if (next.length > 1000) {
      setMessage(
        "Selecciona hasta 1000 filas. Puedes reducirlas con los filtros.",
      );
      return;
    }
    setSelectedPairs(next);
  };
  const bulkState = async (active: boolean) => {
    if (!selectedVisibleRows.length) return;
    const targets = selectedVisibleRows
      .filter((r) => !!r.country)
      .map((r) => ({
        aliasId: r.aliasId,
        country: r.country,
        revision: r.stateRevision,
      }));
    if (!targets.length) return;
    setBusy(true);
    try {
      const result = await api("meta-ads/effectiveness/states", "PATCH", {
        tableId,
        since,
        until,
        metrics: visibleMetrics.map((m) => m.key),
        active,
        targets,
      });
      const keys = new Set(targets.map(activationKey));
      setSelectedPairs((old) => old.filter((k) => !keys.has(k)));
      try {
        await refresh();
        setMessage(
          `${result.changed} filas ${active ? "activadas" : "desactivadas"}; ${result.unchanged} ya tenían ese estado.`,
        );
      } catch {
        setMessage(
          "Estados guardados. No se pudo recargar la hoja; actualiza la página antes de continuar.",
        );
      }
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "No se pudieron cambiar los estados.",
      );
    } finally {
      setBusy(false);
    }
  };
  const sortId = (v: SheetSort) =>
    v.kind === "text" ? v.field : v.day + "-" + v.metric;
  const order = (v: SheetSort) =>
    setSheetSort({
      ...v,
      direction:
        sortId(v) === sortId(activeSort) && activeSort.direction === "asc"
          ? "desc"
          : "asc",
    });
  const arrow = (v: SheetSort) =>
    sortId(v) === sortId(activeSort)
      ? activeSort.direction === "asc"
        ? " ↑"
        : " ↓"
      : " ↕";
  const chooseReportRange = (a: string, b: string) => {
    if (
      !a ||
      !b ||
      a > b ||
      (Date.parse(b) - Date.parse(a)) / 86400000 >= 3660
    ) {
      setMessage("Elige un período válido de hasta diez años.");
      return;
    }
    setHistoryPeriod(null);
    const window = activePeriodWindow(a, b);
    setReportRange(window.next ? { since: a, until: b } : null);
    setSince(window.since);
    setUntil(window.until);
  };
  const expandedToolbar = (
    <div className="financial-table-window-toolbar">
      <div
        className="financial-table-window-views"
        role="group"
        aria-label="Vista de tabla ampliada"
      >
        <button
          type="button"
          aria-pressed={view === "manual"}
          onClick={() => onViewChange("manual")}
        >
          Vista manual
        </button>
        <button
          type="button"
          aria-pressed={view === "automatic"}
          onClick={() => onViewChange("automatic")}
        >
          Vista automática
        </button>
      </div>
      <MetaDateRange
        maxDays={3660}
        from={reportRange?.since ?? since}
        to={reportRange?.until ?? until}
        onChange={chooseReportRange}
      />
      <nav
        className="financial-table-window-sheets"
        aria-label="Hojas de tabla ampliada"
      >
        <span>Hojas:</span>
        {tables.map((t) => (
          <button
            type="button"
            key={t.id}
            aria-current={t.id === tableId ? "page" : undefined}
            onClick={() => onChooseTable(t.id)}
          >
            {t.name}
          </button>
        ))}
      </nav>
    </div>
  );
  return (
    <section
      className="effectiveness sheet-view financial-sheet-view"
      tabIndex={0}
      onKeyDown={(event) => horizontalSheetKey(event, horizontalScroll.current)}
      onPointerDown={(event) => {
        const target = event.target as HTMLElement;
        if (
          !target.closest(
            "input,textarea,select,button,a,label,table,[contenteditable=true],[popover],dialog",
          )
        )
          event.currentTarget.focus({ preventScroll: true });
      }}
      aria-label="Efectividad diaria"
    >
      {duplicateReview.dialog}
      {rowDeletion && (
        <DeleteEffectivenessRows
          selection={rowDeletion}
          onClose={() => setRowDeletion(null)}
          onDeleted={async () => {
            await onNamesChanged();
            const keys = new Set(rowDeletion.targets.map(activationKey));
            temporaryCategories.forget([...keys]);
            setSelectedPairs((old) => old.filter((k) => !keys.has(k)));
            setData((old) =>
              old
                ? {
                    ...old,
                    rows: old.rows.filter(
                      (row) => !keys.has(activationKey(row)),
                    ),
                  }
                : old,
            );
            notifyAdvisorSalesChanged();
            try {
              await refresh();
              setMessage(
                `${rowDeletion.targets.length} filas eliminadas de esta hoja.`,
              );
            } catch {
              setMessage(
                "Filas eliminadas. No se pudo recargar la hoja; actualiza la página antes de continuar.",
              );
            }
            setRowDeletion(null);
          }}
        />
      )}
      {inventoryError && <p role="alert">{inventoryError}</p>}
      {temporaryCategories.warning && (
        <p className="sheet-message" role="status">
          {temporaryCategories.warning}
        </p>
      )}
      {salesReview && (
        <AdvisorSalesApproval
          {...salesReview}
          onClose={() => setSalesReview(null)}
          onApproved={refresh}
        />
      )}
      {newAssignment && (
        <AdvisorAssignment
          initial
          aliasId="new-alias"
          country={newCountry || "País por definir"}
          name={newName.trim() || "Nuevo inventario"}
          advisorId={newAssignment}
          revision={0}
          advisors={advisors}
          onClose={() => setNewAssignment(null)}
          onSave={async (body) => {
            const b = body as {
              day: string;
              mode: "DAY" | "CLOCK";
              time?: string;
            };
            setNewAdvisor(newAssignment);
            setNewTiming({
              day: b.day,
              mode: b.mode,
              ...(b.time ? { time: b.time } : {}),
            });
          }}
        />
      )}
      {bulkAdvisor && (
        <AdvisorBulkAssignment
          tableId={tableId}
          {...bulkAdvisor}
          onClose={() => setBulkAdvisor(null)}
          onSaved={async () => {
            notifyAdvisorSalesChanged();
            await refresh();
          }}
        />
      )}
      {assignment && (
        <AdvisorAssignment
          aliasId={assignment.row.aliasId}
          country={assignment.row.country}
          name={assignment.name}
          advisorId={assignment.advisorId}
          revision={assignment.row.rowRevision}
          advisors={advisors}
          onClose={() => setAssignment(null)}
          onSave={(body) =>
            mutate("meta-ads/effectiveness/advisor", "PATCH", body)
          }
        />
      )}
      {advisorDetail && (
        <AdvisorDetail
          key={`${advisorDetail.id}:${advisorDetail.aliasId}:${advisorDetail.country}`}
          openRequest={detailVersion}
          person={{
            id: advisorDetail.id,
            name: advisorDetail.name,
            revision: 0,
            days: {},
          }}
          tables={tables}
          initialTableId={tableId}
          initialAliasId={advisorDetail.aliasId}
          initialCountry={advisorDetail.country}
          initialSince={since}
          initialUntil={until}
          onClose={() => setAdvisorDetail(null)}
          onOpenPeriod={onOpenAdvisorPeriod}
        />
      )}

      <div className="row sheet-toolbar sheet-financial-toolbar">
        <div
          className="sheet-control-group"
          role="group"
          aria-label="Período y filtros"
        >
          <MetaDateRange
            maxDays={3660}
            from={reportRange?.since ?? since}
            to={reportRange?.until ?? until}
            onChange={chooseReportRange}
          />
          <span className="sheet-filter-label">Filtros:</span>
          <label>
            País
            <SheetSearchSelect
              label="País de efectividad"
              value={country}
              options={[
                { value: "", label: "Todos" },
                { value: "__none", label: "Sin país" },
                ...countries,
              ]}
              placeholder="Todos"
              onSelect={(v) => {
                setHistoryPeriod(null);
                setCountry(v);
              }}
            />
          </label>
          <SheetMultiFilter
            label="Ver parámetros"
            options={[
              ...metadataColumns.map((column) => ({
                value: "column:" + column.value,
                label: column.label,
              })),
              ...viewMetrics.map((m) => ({
                value: m.key,
                label: `${m.key === "base" ? "Base" : m.name} (${m.label})`,
              })),
            ]}
            value={
              visibleMetadata.length === metadataColumns.length &&
              visibleMetrics.length === viewMetrics.length
                ? null
                : [
                    ...visibleMetadata.map(
                      (column) => "column:" + column.value,
                    ),
                    ...visibleMetrics.map((metric) => metric.key),
                  ]
            }
            onChange={(values) => {
              setMetadataVisible(
                metadataColumns
                  .filter(
                    (column) =>
                      values === null ||
                      values.includes("column:" + column.value),
                  )
                  .map((column) => column.value),
              );
              setSelectedMetrics(
                values === null
                  ? null
                  : viewMetrics
                      .filter((metric) => values.includes(metric.key))
                      .map((metric) => metric.key),
              );
            }}
          />
          <SheetMultiFilter
            label="Filtro de valores"
            options={[
              { value: "zero", label: "Igual a 0" },
              { value: "positive", label: "Mayor que 0" },
              { value: "na", label: "N.A. (no aplica)" },
            ]}
            value={valueFilter}
            onChange={setValueFilter}
          >
            <div className="sheet-fill-controls">
              <small>
                Muestra filas con algún valor coincidente en las columnas y
                fechas visibles.
              </small>
              <p>
                Completar: {rows.length} filas × {days.length} días ×{" "}
                {visibleMetrics.length} parámetros.
              </p>
              <button
                disabled={
                  busy ||
                  !rows.length ||
                  !visibleMetrics.length ||
                  rows.length > 1000 ||
                  hasLinkedVisibleColumns
                }
                onClick={() => void fillVisible(0)}
              >
                Poner 0 a todos los visibles
              </button>
              <button
                disabled={
                  busy ||
                  !rows.length ||
                  !visibleMetrics.length ||
                  rows.length > 1000 ||
                  hasLinkedVisibleColumns
                }
                onClick={() => void fillVisible("NA")}
              >
                Poner N.A. a todos los visibles
              </button>
              <button
                disabled={
                  busy ||
                  !rows.length ||
                  !visibleMetrics.length ||
                  rows.length > 1000 ||
                  hasLinkedVisibleColumns
                }
                onClick={() => void fillVisible(null)}
              >
                Restaurar valores originales
              </button>
            </div>
          </SheetMultiFilter>
          <label>
            Estado
            <SheetSearchSelect
              label="Estado de inventario"
              value={stateFilter}
              placeholder="Todos"
              options={[
                { value: "", label: "Todos" },
                { value: "active", label: "Activados" },
                { value: "inactive", label: "Desactivados" },
              ]}
              onSelect={setStateFilter}
            />
          </label>
        </div>
        <div
          className="sheet-control-group"
          role="group"
          aria-label="Formato y sincronización"
        >
          <SheetColorsControl
            tableId={tableId}
            tables={tables}
            metrics={visibleMetrics.map((m) => m.key)}
            onRules={setColorRules}
            onError={setMessage}
          />
          <button
            className={syncOpen ? "primary" : ""}
            aria-expanded={syncOpen}
            onClick={() => setSyncOpen((v) => !v)}
          >
            ⇄ Sincronizar o vincular columnas
          </button>
        </div>
        <div
          className="sheet-activation-actions"
          role="group"
          aria-label="Acciones de las filas seleccionadas"
          title="Aplica solo a las filas seleccionadas visibles, por inventario y país. No modifica Meta Ads."
        >
          <span>Selección ({selectedVisibleRows.length})</span>
          <button
            className="sheet-activate-bulk"
            disabled={busy || !selectedVisibleRows.some((r) => !!r.country)}
            onClick={() => void bulkState(true)}
          >
            Activar
          </button>
          <button
            className="sheet-deactivate-bulk"
            disabled={busy || !selectedVisibleRows.some((r) => !!r.country)}
            onClick={() => void bulkState(false)}
          >
            Desactivar
          </button>
          <button
            type="button"
            className="danger"
            disabled={busy || !valid || !selectedVisibleRows.length}
            onClick={() =>
              setRowDeletion({
                tableId,
                since,
                until,
                targets: selectedVisibleRows.map((r) => ({
                  aliasId: r.aliasId,
                  country: r.country,
                })),
              })
            }
          >
            Eliminar filas seleccionadas ({selectedVisibleRows.length})
          </button>
          {selectedPairs.length > 0 && (
            <button
              aria-label="Limpiar selección de inventario"
              disabled={busy}
              onClick={() => setSelectedPairs([])}
            >
              ×
            </button>
          )}
        </div>
        <div
          className="sheet-control-group sheet-import-actions"
          role="group"
          aria-label="Añadir inventario"
        >
          <button
            onClick={() => {
              setCsv(false);
              setPaste("");
            }}
          >
            Pegar inventario
          </button>
          <label className="sheet-file">
            Subir archivo
            <input
              type="file"
              aria-label="Subir lista de inventario"
              accept=".txt,.tsv,.csv,text/plain,text/csv"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                if (f.size > 100000) {
                  setMessage("El archivo admite hasta 100 KB.");
                  return;
                }
                try {
                  setCsv(f.name.toLowerCase().endsWith(".csv"));
                  setPaste(await f.text());
                } catch {
                  setMessage("No se pudo leer el archivo.");
                }
              }}
            />
          </label>
        </div>
      </div>
      {syncOpen && (
        <EffectivenessSync
          tableId={tableId}
          tables={tables}
          since={since}
          until={until}
          onSynced={async () => {
            await onNamesChanged();
            await refresh();
          }}
        />
      )}
      {reportRange && reportWindow && (
        <nav
          className="sheet-period-nav"
          aria-label="Período de consulta de la hoja"
        >
          <span>
            Período completo: {reportRange.since} — {reportRange.until}.
            Mostrando {since} — {until}. Las ediciones y acciones se aplican a
            las fechas visibles.
          </span>
          <div className="row">
            <button
              type="button"
              disabled={!reportWindow.previous}
              onClick={() => {
                const w = activePeriodWindow(
                  reportRange.since,
                  reportRange.until,
                  reportWindow.previous!,
                );
                setSince(w.since);
                setUntil(w.until);
              }}
            >
              ← Fechas anteriores
            </button>
            <button
              type="button"
              disabled={!reportWindow.next}
              onClick={() => {
                const w = activePeriodWindow(
                  reportRange.since,
                  reportRange.until,
                  reportWindow.next!,
                );
                setSince(w.since);
                setUntil(w.until);
              }}
            >
              Fechas siguientes →
            </button>
          </div>
        </nav>
      )}
      {historyPeriod && historyWindow && (
        <div
          className="sheet-period-nav"
          role="region"
          aria-label="Tabla del período activo"
        >
          <div>
            <strong>
              {historyPeriod.heading ?? "Período activo"} de{" "}
              {historyPeriod.name} · {historyPeriod.country}:{" "}
              {historyPeriod.since} — {historyPeriod.through}
            </strong>
            <small>
              Mostrando {since} — {until}.{" "}
              {historyPeriod.detail ??
                "Las cifras corresponden a estas fechas; el interruptor muestra el estado actual."}
            </small>
          </div>
          <div className="row">
            <button
              disabled={!historyWindow.previous}
              onClick={() =>
                historyWindow.previous &&
                pageActivePeriod(historyWindow.previous)
              }
            >
              31 días anteriores
            </button>
            <button
              disabled={!historyWindow.next}
              onClick={() =>
                historyWindow.next && pageActivePeriod(historyWindow.next)
              }
            >
              31 días siguientes
            </button>
            <button onClick={closeActivePeriod}>
              Volver a la vista anterior
            </button>
          </div>
        </div>
      )}
      {data?.columnLink && (
        <p className="sheet-link-status" role="status">
          🔗 Columnas vinculadas a «{data.columnLink.sourceName}»:{" "}
          {data.columnLink.columns
            .map((m) => sheetMetrics.find((x) => x.key === m)?.label)
            .join(", ")}
          .{" "}
          {data.columnLink.since
            ? `${data.columnLink.since} — ${data.columnLink.until}.`
            : "Todas las fechas."}{" "}
          Edita las cifras en el origen. Actualización automática; puedes
          desvincular desde «Sincronizar o vincular columnas».
        </p>
      )}
      <div className="sheet-help">
        Edita y pulsa Enter o Tab para guardar; Escape descarta. V, P y CF
        manuales; B/G de Meta por inventario + país, con ajustes manuales
        identificados. El asesor es opcional y no condiciona B/G. N.A. no es
        cero. P, G y CF se muestran en la moneda elegida con la tasa de cada
        fecha.{" "}
        {data?.missingFxDays.length ? (
          <span> Tasas pendientes: {data.missingFxDays.join(", ")}. </span>
        ) : null}
        <details>
          <summary>Cómo se calcula</summary> Ver parámetros elige las columnas
          visibles de cada fecha; Filtro de inventario elige las filas. Se
          cruzan con el país y el rango de fechas; Todos incluye la lista
          completa, aunque haya una búsqueda escrita. Ocultar una columna no
          borra sus datos. Los importes de monedas distintas se ordenan en
          grupos separados. Solo campañas, incluidas apagadas; nunca suma sus
          conjuntos/anuncios. Se consulta lo importado cada 30 s; hoy puede ser
          parcial y cada cuenta conserva su zona horaria. — sin dato, *
          cobertura parcial. Cambiar país consulta B/G de ese país sin cambiar
          las etiquetas de Meta Ads. Cambiar moneda convierte importes sin
          alterar los originales. Un elemento del inventario puede tener una
          fila por país. La tasa diaria de referencia proviene de Currency API;
          no es una cotización bancaria de compra/venta.
        </details>
      </div>
      {widthWarning && (
        <p className="sheet-message" role="status">
          {widthWarning}
        </p>
      )}
      {message && (
        <p className="sheet-message" role="status">
          {message}
          <button
            className="ui-close-button"
            type="button"
            aria-label="Cerrar aviso"
            onClick={() => setMessage("")}
          >
            ×
          </button>
        </p>
      )}
      {!valid && <p role="alert">Elige un rango válido de hasta 31 días.</p>}
      {paste !== null && (
        <form
          className="sheet-import"
          onSubmit={(e) => {
            e.preventDefault();
            void importRows();
          }}
        >
          <label>
            Pega una columna de nombres o tres columnas: Inventario, País y
            Moneda (sin encabezados).
            <textarea
              aria-label="Lista de inventario"
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              placeholder={
                "Monitoreo ambiental\tPE\tPEN\nDermatología\tAR\tUSD"
              }
              required
              rows={6}
            />
          </label>
          <div className="row">
            <label>
              País si la columna no está
              <SheetSearchSelect
                label="País para la lista"
                value={pasteCountry}
                options={[{ value: "", label: "Sin asignar" }, ...countries]}
                onSelect={setPasteCountry}
              />
            </label>
            <label>
              Moneda si la columna no está
              <SheetSearchSelect
                label="Moneda para la lista"
                value={pasteCurrency}
                options={[{ value: "", label: "Sin asignar" }, ...currencies]}
                onSelect={setPasteCurrency}
              />
            </label>
            <span>
              Hasta 500 filas. Nombres existentes se reutilizan; no se
              sobrescriben cifras.
            </span>
            <button className="primary" disabled={busy}>
              Importar filas
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setPaste(null)}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
      {data && rows.length === 0 && (
        <p className="sheet-message" role="status">
          No hay inventario que coincidan con los filtros.
        </p>
      )}
      {visibleMetrics.length === 0 && (
        <p className="sheet-message" role="status">
          Sin parámetros seleccionados. Elige uno o marca Todos para mostrar las
          columnas por fecha.
        </p>
      )}
      {rowsLayout.warning && (
        <p className="sheet-message" role="status">
          {rowsLayout.warning}
        </p>
      )}
      {sheetTabs}
      {valid && (
        <FinancialTableWindow
          title={sheetName}
          scrollRef={horizontalScroll}
          mode={tableWindowMode}
          onModeChange={onTableWindowModeChange}
          toolbar={expandedToolbar}
        >
          <div
            ref={horizontalScroll}
            className="table-scroll effectiveness-scroll sheet-scroll"
          >
            <table
              ref={grid}
              className="effectiveness-grid"
              style={
                {
                  ...(columnWidths.alias
                    ? { "--sheet-alias-width": `${columnWidths.alias}px` }
                    : {}),
                  "--sheet-advisor-width": `${columnWidths.advisor ?? 100}px`,
                  ...(columnWidths.country
                    ? { "--sheet-country-width": `${columnWidths.country}px` }
                    : {}),
                  ...(columnWidths.currency
                    ? { "--sheet-currency-width": `${columnWidths.currency}px` }
                    : {}),
                  "--sheet-metrics-width": `${days.reduce((sum, day) => sum + visibleMetrics.reduce((n, m) => n + (columnWidths.metric ?? columnWidths[day + m.key] ?? 36), 0), 0)}px`,
                } as CSSProperties
              }
            >
              <caption className="sr-only">
                Efectividad diaria desde {since} hasta {until}
              </caption>
              <colgroup>
                {visibleMetadata.map((c) => (
                  <col
                    key={c.value}
                    data-column-key={c.value}
                    style={
                      c.value === "evaluation"
                        ? { width: columnWidths.evaluation ?? 110 }
                        : undefined
                    }
                    className={
                      c.value === "evaluation"
                        ? "financial-evaluation-col"
                        : `sheet-${c.value}-col`
                    }
                  />
                ))}
                {days.flatMap((day) =>
                  visibleMetrics.map((metric) => (
                    <col
                      key={day + metric.key}
                      data-column-key={day + metric.key}
                      className="sheet-metric-col"
                      style={{
                        width:
                          columnWidths.metric ??
                          columnWidths[day + metric.key] ??
                          36,
                      }}
                    />
                  )),
                )}
              </colgroup>

              <thead>
                <tr>
                  <th
                    rowSpan={visibleMetrics.length ? 2 : 1}
                    scope="col"
                    className="effectiveness-name"
                    data-table-window-handle
                    hidden={!metadataVisible.includes("alias")}
                    aria-sort={
                      activeSort.kind === "text" && activeSort.field === "alias"
                        ? activeSort.direction === "asc"
                          ? "ascending"
                          : "descending"
                        : undefined
                    }
                  >
                    {metadataControls("alias", "Inventario")}
                    <FinancialTableWindowControls />
                    <div className="sheet-alias-heading">
                      <input
                        type="checkbox"
                        className="sheet-alias-select"
                        aria-label="Seleccionar todas las filas visibles"
                        checked={allVisibleSelected}
                        disabled={busy || !eligibleRows.length}
                        title="Selecciona las filas visibles con país para activar o desactivar en bloque"
                        ref={(el) => {
                          if (el)
                            el.indeterminate =
                              selectedVisibleRows.length > 0 &&
                              !allVisibleSelected;
                        }}
                        onChange={() => {
                          const next = new Set(selectedPairs);
                          for (const r of eligibleRows) {
                            if (allVisibleSelected)
                              next.delete(activationKey(r));
                            else next.add(activationKey(r));
                          }
                          choosePairs([...next]);
                        }}
                      />
                      <EffectivenessCell
                        label="Nombre de columna A"
                        value={inventoryColumnName}
                        onError={setMessage}
                        onSave={(v) => columns({ aliasColumnName: v })}
                      />

                      <button
                        type="button"
                        className="sheet-sort-button"
                        aria-label="Ordenar inventario"
                        title="Ordenar alfabéticamente ascendente o descendente"
                        onClick={() =>
                          order({
                            kind: "text",
                            field: "alias",
                            direction: "asc",
                          })
                        }
                      >
                        {arrow({
                          kind: "text",
                          field: "alias",
                          direction: "asc",
                        })}
                      </button>
                    </div>
                    <button
                      type="button"
                      className="sheet-analysis-trigger"
                      aria-label={`Ver detalle de toda la hoja ${sheetName}`}
                      onClick={() => setSheetSalesDetailOpen(true)}
                    >
                      Ver detalle de la hoja
                    </button>
                    <div className="financial-inventory-controls">
                      <small>Seleccionar inventario</small>
                      <SheetSearchSelect
                        label="Seleccionar inventario"
                        placeholder="Seleccionar inventario"
                        value={inventoryId}
                        options={inventoryLists.map((s) => ({
                          value: s.id,
                          label: s.name,
                        }))}
                        disabled={busy}
                        onSelect={(id) => {
                          setInventoryPreference(id);
                          setNewName("");
                        }}
                      />
                      {!inventoryId && (
                        <small>
                          Crea una pestaña Inventario para añadir ítems.
                        </small>
                      )}
                      <InventoryMultiSelect
                        key={tableId + ":" + inventoryId}
                        label="Buscar y filtrar inventario de la hoja"
                        placeholder="Buscar inventario…"
                        all={false}
                        selectAll
                        confirmLabel="Buscar"
                        options={inventoryNames.map((name) => ({
                          value: name,
                          label: name,
                        }))}
                        values={(selectedAliases ?? [])
                          .map(
                            (id) =>
                              financialAliases.find((alias) => alias.id === id)
                                ?.name,
                          )
                          .filter((name): name is string => !!name)}
                        disabled={busy || !inventoryId}
                        addDisabled={inventoryState?.listId !== inventoryId}
                        description="Marca diplomados y elige Buscar o Agregar."
                        onError={setMessage}
                        onChange={(names) => {
                          const ids = financialAliases
                            .filter((alias) => names.includes(alias.name))
                            .map((alias) => alias.id);
                          if (names.length && !ids.length)
                            throw Error(
                              "Los seleccionados aún no están en esta hoja. Pulsa Agregar seleccionados.",
                            );
                          setHistoryPeriod(null);
                          setSelectedAliases(ids.length ? ids : null);
                        }}
                        onAdd={async (names) => {
                          if (!isCurrency(settings.defaultCurrency))
                            throw Error(
                              "Elige la moneda de la hoja antes de agregar los diplomados.",
                            );
                          if (inventoryState?.listId !== inventoryId)
                            throw Error(
                              "Actualiza el catálogo antes de agregar.",
                            );
                          const chosen = [...new Set(names)];
                          if (
                            chosen.some(
                              (name) => !inventoryNames.includes(name),
                            )
                          )
                            throw Error(
                              "El catálogo cambió. Vuelve a seleccionar los diplomados.",
                            );
                          setBusy(true);
                          try {
                            await mutate(
                              "meta-ads/effectiveness/import",
                              "POST",
                              {
                                tableId,
                                inventorySheetId: inventoryId,
                                catalogRevision: inventoryState.revision,
                                existingOnly: true,
                                rows: chosen.map((name) => ({
                                  name,
                                  country: settings.defaultCountry,
                                  currency: settings.defaultCurrency,
                                })),
                                ...(settings.defaultCountry
                                  ? { initialActive: false }
                                  : {}),
                              },
                              true,
                            );
                            setHistoryPeriod(null);
                            setSelectedAliases(null);
                            setCountry("");
                            setStateFilter("");
                            setValueFilter(null);
                            setMessage(
                              `${chosen.length} diplomado${chosen.length === 1 ? "" : "s"} agregado${chosen.length === 1 ? "" : "s"} o ya presente${chosen.length === 1 ? "" : "s"} en la hoja.`,
                            );
                          } finally {
                            setBusy(false);
                          }
                        }}
                      />
                    </div>
                    <SheetColumnResizer
                      label={inventoryColumnName}
                      onResize={(w) => resizeColumn("alias", w)}
                      onReset={() => resizeColumn("alias")}
                    />
                  </th>
                  <th
                    rowSpan={visibleMetrics.length ? 2 : 1}
                    scope="col"
                    className="effectiveness-country"
                    hidden={!metadataVisible.includes("country")}
                  >
                    {metadataControls("country", "País")}
                    <button
                      type="button"
                      className="sheet-sort-button"
                      aria-label="Ordenar por país"
                      onClick={() =>
                        order({
                          kind: "text",
                          field: "country",
                          direction: "asc",
                        })
                      }
                    >
                      País
                      {arrow({
                        kind: "text",
                        field: "country",
                        direction: "asc",
                      })}
                    </button>
                    <SheetSearchSelect
                      compact
                      className="sheet-column-control"
                      label="País para todas las filas"
                      value={settings.defaultCountry}
                      placeholder="Todas"
                      options={[
                        { value: "", label: "Vacío en todas" },
                        ...countries,
                      ]}
                      onSelect={(v) => columns({ country: v })}
                      onError={setMessage}
                    />
                    <SheetColumnResizer
                      label="País"
                      onResize={(w) => resizeColumn("country", w)}
                      onReset={() => resizeColumn("country")}
                    />
                  </th>
                  <th
                    rowSpan={visibleMetrics.length ? 2 : 1}
                    scope="col"
                    className="effectiveness-advisor"
                    hidden={!metadataVisible.includes("advisor")}
                  >
                    {metadataControls("advisor", "Asesor")}
                    Asesor
                    <SheetSearchSelect
                      label="Ordenar por"
                      value={grouping}
                      options={[
                        {
                          value: "inventory",
                          label: "Ordenado por inventario",
                        },
                        { value: "advisor", label: "Ordenado por asesor" },
                      ]}
                      onSelect={(value) =>
                        setGrouping(value as "inventory" | "advisor")
                      }
                    />
                    <SheetSearchSelect
                      label="Asignar asesor a filas de la hoja"
                      placeholder="Asignar asesor…"
                      value=""
                      disabled={busy || !rows.some((r) => r.country)}
                      options={[
                        { value: "__none", label: "Sin asesor" },
                        ...advisors.map((a) => ({
                          value: a.id,
                          label: a.label ?? a.name,
                        })),
                      ]}
                      onSelect={(id) =>
                        setBulkAdvisor({
                          advisorId: id === "__none" ? null : id,
                          name:
                            id === "__none"
                              ? "Sin asesor"
                              : (advisors.find((a) => a.id === id)?.name ??
                                "asesor"),
                          selected: [...selectedVisibleRows],
                          visible: [...rows],
                        })
                      }
                    />
                    <SheetColumnResizer
                      label="Asesor"
                      onResize={(w) => resizeColumn("advisor", w)}
                      onReset={() => resizeColumn("advisor")}
                    />
                  </th>

                  <th
                    rowSpan={visibleMetrics.length ? 2 : 1}
                    scope="col"
                    className="effectiveness-currency"
                    hidden={!metadataVisible.includes("currency")}
                  >
                    {metadataControls("currency", "Moneda")}
                    <button
                      type="button"
                      className="sheet-sort-button"
                      aria-label="Ordenar por moneda"
                      onClick={() =>
                        order({
                          kind: "text",
                          field: "currency",
                          direction: "asc",
                        })
                      }
                    >
                      Moneda
                      {arrow({
                        kind: "text",
                        field: "currency",
                        direction: "asc",
                      })}
                    </button>
                    <SheetSearchSelect
                      compact
                      className="sheet-column-control"
                      label="Moneda para todas las filas"
                      value={settings.defaultCurrency}
                      placeholder="Todas"
                      options={[
                        { value: "", label: "Vacío en todas" },
                        ...currencies,
                      ]}
                      onSelect={(v) => columns({ currency: v })}
                      onError={setMessage}
                    />
                    <SheetColumnResizer
                      label="Moneda"
                      onResize={(w) => resizeColumn("currency", w)}
                      onReset={() => resizeColumn("currency")}
                    />
                  </th>
                  <th
                    rowSpan={visibleMetrics.length ? 2 : 1}
                    scope="col"
                    className="financial-evaluation"
                    hidden={!metadataVisible.includes("evaluation")}
                  >
                    Estado {metadataControls("evaluation", "Estado")}
                    <SheetColumnResizer
                      label="Estado"
                      onResize={(width) => resizeColumn("evaluation", width)}
                      onReset={() => resizeColumn("evaluation")}
                    />
                  </th>
                  {visibleMetrics.length > 0 &&
                    days.map((d) => (
                      <th
                        key={d}
                        className="sheet-date-heading"
                        data-day={d}
                        colSpan={visibleMetrics.length}
                        scope="colgroup"
                      >
                        {d.slice(8)}.{d.slice(5, 7)}
                      </th>
                    ))}
                </tr>
                {visibleMetrics.length > 0 && (
                  <tr>
                    {days.flatMap((d) =>
                      visibleMetrics.map((m) => (
                        <th
                          key={d + m.key}
                          className="sheet-parameter-heading"
                          data-metric={m.key}
                          data-fill-kind={sheetMetricDataFill(m.key, {
                            linked: !!linkedColumn(m.key, d),
                          })}
                          scope="col"
                          aria-sort={
                            activeSort.kind === "day" &&
                            activeSort.day === d &&
                            activeSort.metric === m.key
                              ? activeSort.direction === "asc"
                                ? "ascending"
                                : "descending"
                              : undefined
                          }
                        >
                          <button
                            type="button"
                            className="sheet-sort-button"
                            aria-label={`Ordenar ${m.name} ${d}`}
                            title={
                              m.money
                                ? "Ordena dentro de cada moneda; desconocidos al final"
                                : `Ordenar ${m.name} de ${d}`
                            }
                            onClick={() =>
                              order({
                                kind: "day",
                                day: d,
                                metric: m.key,
                                direction: "asc",
                              })
                            }
                          >
                            {m.label}
                            {arrow({
                              kind: "day",
                              day: d,
                              metric: m.key,
                              direction: "asc",
                            })}
                          </button>
                          <SheetDataFillBadge
                            compact
                            kind={sheetMetricDataFill(m.key, {
                              linked: !!linkedColumn(m.key, d),
                            })}
                          />
                          <SheetActiveFill
                            metric={m.key}
                            name={m.name}
                            day={d}
                            disabled={busy || !data || linkedColumn(m.key, d)}
                            onError={setMessage}
                            onApply={async (value) => {
                              const targets = (data?.rows ?? []).filter(
                                (r) => r.active,
                              );
                              if (!targets.length)
                                throw Error(
                                  "No hay elementos activos en el inventario en esta hoja.",
                                );
                              setBusy(true);
                              try {
                                await fill(targets, [m.key], value, [d], true);
                              } finally {
                                setBusy(false);
                              }
                            }}
                          />
                          <SheetColumnResizer
                            label={`${m.name} ${d}`}
                            description="Arrastra para ajustar todos los parámetros y fechas, en vista manual y automática. Doble clic restablece todos."
                            onResize={(w) => resizeColumn("metric", w)}
                            onReset={() => resizeColumn("metric", 36)}
                          />
                        </th>
                      )),
                    )}
                  </tr>
                )}
              </thead>
              <tbody>
                {displayedRows.map((r) => {
                  const name = names.get(r.aliasId) ?? "Inventario";
                  const category = financialRowCategories(
                    r,
                    financialAliases.find((a) => a.id === r.aliasId),
                    temporaryCategories.temporary,
                  );
                  const advisorBand = firstAdvisorBands.get(activationKey(r)),
                    inactiveCount = firstInactiveBands.get(activationKey(r));
                  const band = showCategoryBands
                    ? firstBands.get(activationKey(r))
                    : undefined;
                  return (
                    <Fragment key={activationKey(r)}>
                      {pendingAssignmentRows[0] &&
                        activationKey(pendingAssignmentRows[0]) ===
                          activationKey(r) && (
                          <tr className="financial-pending-assignment-band">
                            <th
                              colSpan={Math.max(
                                1,
                                visibleMetadata.length +
                                  days.length * visibleMetrics.length,
                              )}
                            >
                              <span>
                                <strong>Por asignar</strong>
                                <small>
                                  Campaña o datos pendientes ·{" "}
                                  {pendingAssignmentRows.length}
                                </small>
                              </span>
                            </th>
                          </tr>
                        )}
                      {advisorBand && (
                        <tr
                          className="financial-advisor-band"
                          data-advisor-group={advisorBand.id || "none"}
                        >
                          <th
                            colSpan={Math.max(
                              1,
                              visibleMetadata.length +
                                days.length * visibleMetrics.length,
                            )}
                          >
                            <span>
                              <strong>{advisorBand.name}</strong>
                              <small>
                                {advisorBand.rows.length}{" "}
                                {advisorBand.rows.length === 1
                                  ? "fila"
                                  : "filas"}
                              </small>
                            </span>
                          </th>
                        </tr>
                      )}
                      {inactiveCount && (
                        <tr className="financial-inactive-band">
                          <th
                            colSpan={Math.max(
                              1,
                              visibleMetadata.length +
                                days.length * visibleMetrics.length,
                            )}
                          >
                            <span>
                              <strong>Desactivados</strong>
                              <small>
                                {inactiveCount}{" "}
                                {inactiveCount === 1 ? "fila" : "filas"}
                              </small>
                            </span>
                          </th>
                        </tr>
                      )}
                      {band && (
                        <tr className="financial-category-band">
                          <th
                            colSpan={Math.max(
                              1,
                              visibleMetadata.length +
                                days.length * visibleMetrics.length,
                            )}
                          >
                            <span>
                              <strong>
                                {band.names.join(" · ") ||
                                  "Sin categoría principal"}
                              </strong>
                              <small>
                                {band.names.length > 0 &&
                                  `${band.temporary ? "Categoría temporal" : "Categoría principal"} · `}
                                {band.rows.length}{" "}
                                {band.rows.length === 1 ? "fila" : "filas"}
                              </small>
                            </span>
                          </th>
                        </tr>
                      )}
                      <SheetSizedRow
                        label={`${name} ${r.country}`}
                        height={rowsLayout.heights[r.aliasId + ":" + r.country]}
                        onResize={(v) =>
                          rowsLayout.resize(r.aliasId + ":" + r.country, v)
                        }
                        onReset={() =>
                          rowsLayout.resize(r.aliasId + ":" + r.country)
                        }
                        key={JSON.stringify([r.aliasId, r.country])}
                        data-alias-id={r.aliasId}
                        data-country={r.country}
                        data-currency={r.currency}
                        data-active={r.active}
                        data-campaign-task={r.campaignTask ?? "NONE"}
                        data-pending-assignment={
                          pendingAssignmentKeys.has(activationKey(r)) ||
                          undefined
                        }
                        data-sheet-focus={
                          (initialPeriodLink?.focus &&
                            initialPeriodLink.aliasId === r.aliasId &&
                            initialPeriodLink.country === r.country) ||
                          undefined
                        }
                      >
                        <td
                          className="effectiveness-name"
                          hidden={!metadataVisible.includes("alias")}
                        >
                          <div className="sheet-alias-row">
                            <input
                              type="checkbox"
                              className="sheet-alias-select"
                              aria-label={`Seleccionar ${name} ${r.country || "sin país"}`}
                              checked={selectedPairSet.has(activationKey(r))}
                              disabled={busy}
                              title={`Seleccionar ${name} en ${r.country || "sin país"} para acciones de esta hoja`}
                              onChange={() =>
                                choosePairs(
                                  selectedPairSet.has(activationKey(r))
                                    ? selectedPairs.filter(
                                        (k) => k !== activationKey(r),
                                      )
                                    : [...selectedPairs, activationKey(r)],
                                )
                              }
                            />
                            <button
                              type="button"
                              role="switch"
                              aria-checked={r.active}
                              className="meta-status-switch sheet-alias-switch"
                              data-campaign-task={r.campaignTask ?? "NONE"}
                              disabled={busy || !r.country}
                              aria-label={`${r.active ? "Desactivar" : "Activar"} ${name} ${r.country || "sin país"}`}
                              title={
                                !r.country
                                  ? "Elige un país para activar o desactivar esta fila"
                                  : `${r.active ? "Activado" : "Desactivado"} · ${r.country}${r.lastStateChange ? " · " + new Date(r.lastStateChange).toLocaleString("es-PE", { timeZone: "America/Lima" }) : " · por defecto"}. Solo Efectividad.`
                              }
                              onClick={() => void toggleState(r)}
                            >
                              <span aria-hidden="true" />
                            </button>
                            <EffectivenessCell
                              label={`Inventario ${name} ${r.country || "sin país"}`}
                              value={name}
                              onError={setMessage}
                              onPaste={openPaste}
                              onSave={async (v) => {
                                if (!v || v.length > 150)
                                  throw Error(
                                    "El nombre debe tener entre 1 y 150 caracteres.",
                                  );
                                await mutate(
                                  "meta-ads/aliases/" + r.aliasId,
                                  "PATCH",
                                  { name: v },
                                  true,
                                );
                              }}
                            />
                            {!!category.choices.length && (
                              <span
                                className="financial-temporary-category"
                                data-temporary={category.temporary || undefined}
                              >
                                <InventoryMultiSelect
                                  compact
                                  all={false}
                                  label={`${r.active ? "Categoría temporal" : "Categoría principal del inventario"} de ${name} ${r.country || "sin país"}`}
                                  placeholder="▤"
                                  options={category.choices.map((c) => ({
                                    value: c.id,
                                    label: c.name,
                                  }))}
                                  values={category.ids}
                                  disabled={busy || !r.active}
                                  description="Solo categorías ya asignadas a este inventario. Puedes elegir varias, incluidas las secundarias. Vacío restaura las principales del inventario. Los desactivados siempre usan las principales del inventario."
                                  onChange={(ids) =>
                                    temporaryCategories.choose(
                                      activationKey(r),
                                      ids,
                                      category.defaults,
                                    )
                                  }
                                />
                              </span>
                            )}
                            <EffectivenessHistory
                              tableId={tableId}
                              aliasId={r.aliasId}
                              country={r.country}
                              name={name}
                              initialSince={since}
                              initialUntil={until}
                              onPeriod={(period) =>
                                openActivePeriod(period, r, name)
                              }
                            />
                          </div>
                        </td>
                        <td
                          className="effectiveness-country"
                          hidden={!metadataVisible.includes("country")}
                        >
                          <SheetSearchSelect
                            compact
                            placeholder="—"
                            label={`País de ${name} ${r.country || "sin país"}`}
                            value={r.country}
                            options={[
                              { value: "", label: "Sin asignar" },
                              ...countries,
                            ]}
                            onSelect={(v) => identity(r, "country", v)}
                            onError={setMessage}
                          />
                        </td>
                        <td
                          className="effectiveness-advisor"
                          hidden={!metadataVisible.includes("advisor")}
                        >
                          <div className="alias-advisor-actions">
                            <SheetSearchSelect
                              compact
                              displayLabel
                              placeholder="Sin asesor"
                              label={`Asesor de ${name} ${r.country}`}
                              value={
                                advisors.some((a) => a.id === r.advisorId)
                                  ? (r.advisorId ?? "")
                                  : ""
                              }
                              options={[
                                { value: "", label: "Sin asesor" },
                                ...advisors.map((a) => ({
                                  value: a.id,
                                  label: a.label ?? a.name,
                                })),
                              ]}
                              onError={setMessage}
                              onSelect={async (advisorId) => {
                                if (!r.country)
                                  throw Error(
                                    "Elige primero el país de esta fila para asignar el asesor.",
                                  );
                                if ((advisorId || null) !== r.advisorId)
                                  setAssignment({
                                    row: r,
                                    advisorId: advisorId || null,
                                    name,
                                  });
                              }}
                            />
                            {r.advisorId && r.country && (
                              <button
                                type="button"
                                className="advisor-detail-trigger"
                                aria-label={`Detalle del asesor de ${name} ${r.country}`}
                                title="Ver progreso del asesor"
                                onClick={() => {
                                  const p = advisors.find(
                                    (a) => a.id === r.advisorId,
                                  );
                                  if (p) {
                                    setDetailVersion((v) => v + 1);
                                    setAdvisorDetail({
                                      ...p,
                                      aliasId: r.aliasId,
                                      country: r.country,
                                    });
                                  }
                                }}
                              >
                                ↗
                              </button>
                            )}
                          </div>
                        </td>

                        <td
                          className="effectiveness-currency"
                          hidden={!metadataVisible.includes("currency")}
                        >
                          <SheetSearchSelect
                            compact
                            placeholder="—"
                            label={`Moneda de ${name} ${r.country || "sin país"}`}
                            value={r.currency}
                            options={[
                              { value: "", label: "Sin asignar" },
                              ...currencies,
                            ]}
                            onSelect={(v) => identity(r, "currency", v)}
                            onError={setMessage}
                          />
                        </td>
                        <td
                          className="financial-evaluation"
                          hidden={!metadataVisible.includes("evaluation")}
                          title={
                            catalogStatusError ||
                            "Mismo semáforo de Inventario para esta hoja, país y último período de activación."
                          }
                        >
                          <InventoryStatusLabel
                            status={
                              statusLookup.get(
                                JSON.stringify([r.aliasId, r.country]),
                              )?.status ?? "PENDING"
                            }
                          />
                        </td>
                        {days.flatMap((d) => {
                          const c = r.days[d],
                            partial = c && c.campaigns < r.campaigns;
                          const cells = sheetMetrics.map((m) => {
                            const cellColor = sheetCellColor(
                              colorRules,
                              m.key,
                              d,
                              c?.na?.includes(m.key)
                                ? "NA"
                                : (c?.[m.key] ?? null),
                              r.currency || "USD",
                            );
                            const fillKind = sheetMetricDataFill(m.key, {
                              linked: !!c?.linked?.[m.key],
                              synced: !!c?.synced?.[m.key],
                              manual: !!c?.manual?.includes(m.key),
                              automaticNa: !!c?.automaticNa?.includes(m.key),
                              received:
                                m.key === "fixedCost" &&
                                !c?.manual?.includes(m.key) &&
                                !!c?.sourceFixedCost?.length,
                            });
                            return (
                              <td
                                key={d + m.label}
                                data-fill-kind={fillKind}
                                data-na={c?.na?.includes(m.key) || undefined}
                                data-auto-na={
                                  c?.automaticNa?.includes(m.key) || undefined
                                }
                                style={
                                  cellColor
                                    ? ({
                                        "--sheet-rule-color": cellColor,
                                      } as CSSProperties)
                                    : undefined
                                }
                                data-colored={!!cellColor || undefined}
                                className={
                                  m.key === "base" || m.key === "spend"
                                    ? "sheet-derived" +
                                      ((partial &&
                                        !c?.manual?.includes(m.key)) ||
                                      c?.partialMetrics?.includes(m.key)
                                        ? " sheet-partial"
                                        : "")
                                    : c?.synced?.[m.key]
                                      ? "sheet-synced-cell"
                                      : ""
                                }
                              >
                                <EffectivenessCell
                                  allowNA
                                  locked={!!c?.linked?.[m.key]}
                                  onOpen={
                                    m.key === "sales" && !c?.linked?.sales
                                      ? () => {
                                          if (!r.country) {
                                            setMessage(
                                              "Elige el país antes de registrar ventas por asesor.",
                                            );
                                            return;
                                          }
                                          setSalesReview({
                                            aliasId: r.aliasId,
                                            country: r.country,
                                            day: d,
                                          });
                                        }
                                      : undefined
                                  }
                                  manual={
                                    c?.manual?.includes(m.key) &&
                                    !c?.linked?.[m.key]
                                  }
                                  placeholder={
                                    m.money &&
                                    c?.fxMissing &&
                                    c[m.key] === null &&
                                    !c.na?.includes(m.key)
                                      ? "Sin tasa"
                                      : "—"
                                  }
                                  label={`${m.label} ${name} ${r.country} ${d}`}
                                  value={
                                    c?.na?.includes(m.key)
                                      ? "N.A."
                                      : c?.[m.key] === null ||
                                          c?.[m.key] === undefined
                                        ? ""
                                        : m.money
                                          ? c[m.key]!.toFixed(
                                              new Intl.NumberFormat("en", {
                                                style: "currency",
                                                currency: r.currency || "USD",
                                              }).resolvedOptions()
                                                .maximumFractionDigits,
                                            )
                                          : String(c[m.key])
                                  }
                                  onError={setMessage}
                                  onSave={(v) => editCell(r, d, m.key, v)}
                                  hint={`${cellColor ? "Fondo por una regla de Colores para este valor. " : sheetDataFillLabels[fillKind] + ". "}${c?.linked?.[m.key] ? "Vinculada a «" + c.linked[m.key]!.name + "». Edita el origen o desvincula para editar aquí. " + (!c.linked[m.key]!.matched ? "Sin coincidencia exacta de inventario y país. " : "") : ""}${c?.automaticNa?.includes(m.key) ? "N.A. automático por desactivación; vuelve a vacío al activar. " : ""}${c?.synced?.[m.key] ? "Sincronizado desde «" + c.synced[m.key] + "». " : ""}${c?.manual?.includes(m.key) && !c?.linked?.[m.key] ? "Ajuste manual de Efectividad. Originales conservados. " : ""}${m.key === "spend" && !c?.linked?.[m.key] ? "Original Meta: " + (c?.sourceSpend.map((x) => x.currency + " " + x.amount).join(" + ") || "sin datos") + ". " : ""}${c?.fxMissing && c?.[m.key] === null && !c.na?.includes(m.key) ? "Sin tasa. " : ""}${partial || c?.partialMetrics?.includes(m.key) ? "Cobertura parcial. " : ""}${m.key === "fixedCost" && !c?.linked?.[m.key] ? "Original CF: " + (c?.sourceFixedCost.map((x) => x.currency + " " + x.amount).join(" + ") || "sin datos") + ". " : ""}${m.money && !c?.linked?.[m.key] ? c?.fx.map((f) => `${f.date}: 1 ${f.from} = ${f.rate} ${f.to} · ${f.source}`).join("; ") || "" : ""} ${c?.linked?.[m.key] ? "Edita el valor en la hoja de origen." : m.key === "sales" ? "Clic o Enter para elegir asesor y cantidad de ventas." : "Escribe un número o N.A.; vacío restaura el importado en B/G; en P borra el presupuesto."}`}
                                />
                                {(c?.partialMetrics?.includes(m.key) ||
                                  (partial && !c?.manual?.includes(m.key))) &&
                                  (m.key === "base" || m.key === "spend") && (
                                    <span
                                      className="sheet-partial-marker"
                                      title="Cobertura parcial"
                                    >
                                      *
                                    </span>
                                  )}
                              </td>
                            );
                          });
                          return cells.filter((_, i) =>
                            visibleMetricKeys.has(sheetMetrics[i].key),
                          );
                        })}
                      </SheetSizedRow>
                    </Fragment>
                  );
                })}
                <tr className="sheet-new-row">
                  <td
                    className="effectiveness-name"
                    hidden={!metadataVisible.includes("alias")}
                  >
                    <div className="sheet-alias-row">
                      <button
                        type="button"
                        role="switch"
                        className="meta-status-switch sheet-alias-switch"
                        aria-label="Estado de la nueva fila"
                        aria-checked={newActive}
                        disabled={busy || !newCountry}
                        title={
                          newCountry
                            ? "Estado inicial de la nueva fila"
                            : "Elige un país para cambiar el estado inicial"
                        }
                        onClick={() => setNewActive((active) => !active)}
                      >
                        <span aria-hidden="true" />
                      </button>
                      <SheetSearchSelect
                        key={inventoryId}
                        label="Seleccionar o crear inventario para añadir"
                        placeholder="Selecciona o escribe uno nuevo…"
                        value={newName}
                        options={inventoryNames.map((name) => ({
                          value: name,
                          label: name,
                        }))}
                        disabled={
                          busy || inventoryState?.listId !== inventoryId
                        }
                        createOnEnter
                        onError={setMessage}
                        onSelect={async (name) => {
                          setNewName(name);
                          await addRow(name);
                        }}
                        onCreate={async (name) => {
                          setNewName(name);
                          await addRow(name);
                        }}
                      />
                    </div>
                  </td>
                  <td
                    className="effectiveness-country"
                    hidden={!metadataVisible.includes("country")}
                  >
                    <SheetSearchSelect
                      compact
                      placeholder="—"
                      label="País del nuevo inventario"
                      value={newCountry}
                      options={[
                        { value: "", label: "Sin asignar" },
                        ...countries,
                      ]}
                      onSelect={(value) => {
                        setNewCountry(value);
                        if (!value) setNewActive(false);
                      }}
                    />
                  </td>
                  <td
                    className="effectiveness-advisor"
                    hidden={!metadataVisible.includes("advisor")}
                  >
                    <SheetSearchSelect
                      compact
                      displayLabel
                      label="Asesor del nuevo inventario"
                      placeholder="Sin asesor"
                      value={newAdvisor}
                      options={[
                        { value: "", label: "Sin asesor" },
                        ...advisors.map((a) => ({
                          value: a.id,
                          label: a.label ?? a.name,
                        })),
                      ]}
                      onSelect={(id) => {
                        if (!id) {
                          setNewAdvisor("");
                          setNewTiming(null);
                        } else setNewAssignment(id);
                      }}
                      onError={setMessage}
                    />
                    {newAdvisor && (
                      <button
                        type="button"
                        className="advisor-start-trigger"
                        title="Cambiar inicio de la asignación"
                        onClick={() => setNewAssignment(newAdvisor)}
                      >
                        {newTiming?.day.slice(5) ?? "Hoy"} ·{" "}
                        {newTiming?.mode === "CLOCK" ? newTiming.time : "00:00"}
                      </button>
                    )}
                  </td>

                  <td
                    className="effectiveness-currency"
                    hidden={!metadataVisible.includes("currency")}
                  >
                    <SheetSearchSelect
                      compact
                      placeholder="—"
                      label="Moneda del nuevo inventario"
                      value={newCurrency}
                      options={[
                        { value: "", label: "Sin asignar" },
                        ...currencies,
                      ]}
                      onSelect={setNewCurrency}
                    />
                    {visibleMetrics.length === 0 && (
                      <button
                        disabled={
                          busy ||
                          !newName.trim() ||
                          inventoryState?.listId !== inventoryId
                        }
                        onClick={() => void addRow()}
                      >
                        Agregar fila
                      </button>
                    )}
                  </td>
                  <td
                    className="financial-evaluation"
                    hidden={!metadataVisible.includes("evaluation")}
                  >
                    —
                  </td>
                  {visibleMetrics.length > 0 && (
                    <td colSpan={days.length * visibleMetrics.length}>
                      <button
                        disabled={
                          busy ||
                          !newName.trim() ||
                          inventoryState?.listId !== inventoryId
                        }
                        onClick={() => void addRow()}
                      >
                        Agregar fila
                      </button>
                      {!data && (
                        <span role="status" className="sheet-loading-status">
                          Cargando datos…
                        </span>
                      )}
                    </td>
                  )}
                </tr>
              </tbody>
            </table>
          </div>
          <SheetHorizontalNavigation target={horizontalScroll} />
        </FinancialTableWindow>
      )}
      {sheetSalesDetailOpen && (
        <SheetSalesDetail
          inventoryAliases={tables.find((t) => t.id === tableId)?.aliases ?? []}
          tableId={tableId}
          name={sheetName}
          initialSince={since}
          initialUntil={until}
          onClose={() => setSheetSalesDetailOpen(false)}
        />
      )}
    </section>
  );
}
