"use client";
import { notifyAdvisorSalesChanged } from "./advisor-sales-events";
import { AdvisorSalesApproval } from "./advisor-sales-approval";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { engineRequest as api } from "./generation-engine";
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
import { AdvisorAssignment } from "./advisor-assignment";
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
type Data = { rows: Row[]; table: Settings; missingFxDays: string[] };
export function MetaEffectiveness({
  tableId,
  aliases,
  onNamesChanged,
  settings,
  view,
  tables,
  sheetTabs,
  advisors,
  inventoryLists,
}: {
  inventoryLists: { id: string; name: string }[];
  sheetTabs: ReactNode;
  advisors: { id: string; name: string; label?: string }[];
  tables: {
    id: string;
    name: string;
    aliases: { id: string; name: string; inventorySheetId?: string }[];
  }[];
  view: "manual" | "automatic";
  tableId: string;
  settings: Settings;
  aliases: { id: string; name: string }[];
  onNamesChanged: () => Promise<void>;
}) {
  const inventoryColumnName =
    settings.aliasColumnName.trim().toLowerCase() === "alias"
      ? "Inventario"
      : settings.aliasColumnName;
  const rowsLayout = useSheetHeights("financial:" + tableId);
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
  const grid = useRef<HTMLTableElement>(null);
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
  const viewMetrics = sheetMetrics.filter((m) =>
    view === "manual"
      ? m.key === "sales" || m.key === "budget"
      : m.key !== "budget",
  );
  const visibleMetrics = viewMetrics.filter(
    (m) => selectedMetrics === null || selectedMetrics.includes(m.key),
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
    return () => {
      active = false;
      clearInterval(timer);
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
  const addRow = async () => {
    if (
      !newName.trim() ||
      !inventoryId ||
      inventoryState?.listId !== inventoryId
    )
      return;
    setBusy(true);
    setMessage("");
    try {
      const code = resolveCountry(newCountry);
      if (code === null) throw Error("País no reconocido.");
      const rows = parseEffectivenessPaste(newName, code, newCurrency);
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
  const names = useMemo(
    () => new Map(aliases.map((a) => [a.id, a.name])),
    [aliases],
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
  const selectedPairSet = new Set(selectedPairs),
    eligibleRows = rows.filter((r) => !!r.country);
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
    const targets = selectedVisibleRows.map((r) => ({
      aliasId: r.aliasId,
      country: r.country,
      revision: r.stateRevision,
    }));
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
  return (
    <section
      className="effectiveness sheet-view"
      aria-label="Efectividad diaria"
    >
      {duplicateReview.dialog}
      {inventoryError && <p role="alert">{inventoryError}</p>}
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
        />
      )}

      <div className="row sheet-toolbar">
        <MetaDateRange
          from={since}
          to={until}
          onChange={(a, b) => {
            if (!a || !b || (Date.parse(b) - Date.parse(a)) / 86400000 >= 31) {
              setMessage("Elige un rango de hasta 31 días.");
              return;
            }
            setSince(a);
            setUntil(b);
          }}
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
            onSelect={setCountry}
          />
        </label>
        <SheetMultiFilter
          label="Filtro de parámetros"
          options={viewMetrics.map((m) => ({
            value: m.key,
            label: `${m.key === "base" ? "Base" : m.name} (${m.label})`,
          }))}
          value={selectedMetrics}
          onChange={setSelectedMetrics}
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
              Muestra filas con algún valor coincidente en las columnas y fechas
              visibles.
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
                rows.length > 1000
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
                rows.length > 1000
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
                rows.length > 1000
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
          ⇄ Sincronizar columnas
        </button>
        <div
          className="sheet-activation-actions"
          title="Aplica solo a las filas seleccionadas visibles, por inventario y país. No modifica Meta Ads."
        >
          <span>Selección ({selectedVisibleRows.length})</span>
          <button
            className="sheet-activate-bulk"
            disabled={busy || !selectedVisibleRows.length}
            onClick={() => void bulkState(true)}
          >
            Activar
          </button>
          <button
            className="sheet-deactivate-bulk"
            disabled={busy || !selectedVisibleRows.length}
            onClick={() => void bulkState(false)}
          >
            Desactivar
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
      <div className="sheet-help">
        Edita y pulsa Enter o Tab para guardar; Escape descarta. V, P y CF
        manuales; B/G de Meta por coincidencia exacta de inventario + país +
        asesor, con ajustes manuales identificados. N.A. no es cero. P, G y CF
        se muestran en la moneda elegida con la tasa de cada fecha.{" "}
        {data?.missingFxDays.length ? (
          <span> Tasas pendientes: {data.missingFxDays.join(", ")}. </span>
        ) : null}
        <details>
          <summary>Cómo se calcula</summary> Filtro de parámetros elige las
          columnas visibles de cada fecha; Filtro de inventario elige las filas.
          Se cruzan con el país y el rango de fechas; Todos incluye la lista
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
        <div className="table-scroll effectiveness-scroll sheet-scroll">
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
                "--sheet-metrics-width": `${days.reduce((sum, day) => sum + visibleMetrics.reduce((n, m) => n + (columnWidths[day + m.key] ?? 36), 0), 0)}px`,
              } as CSSProperties
            }
          >
            <caption className="sr-only">
              Efectividad diaria desde {since} hasta {until}
            </caption>
            <colgroup>
              <col className="sheet-alias-col" />
              <col className="sheet-country-col" />
              <col className="sheet-advisor-col" />
              <col className="sheet-currency-col" />
              {days.flatMap((day) =>
                visibleMetrics.map((metric) => (
                  <col
                    key={day + metric.key}
                    className="sheet-metric-col"
                    style={{ width: columnWidths[day + metric.key] ?? 36 }}
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
                  aria-sort={
                    activeSort.kind === "text" && activeSort.field === "alias"
                      ? activeSort.direction === "asc"
                        ? "ascending"
                        : "descending"
                      : undefined
                  }
                >
                  <div className="sheet-alias-heading">
                    <input
                      type="checkbox"
                      className="sheet-alias-select"
                      aria-label="Seleccionar inventario visibles"
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
                          if (allVisibleSelected) next.delete(activationKey(r));
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
                  <div className="financial-inventory-controls">
                    <InventoryMultiSelect
                      label="Buscar y filtrar inventario de la hoja"
                      placeholder="Buscar inventario…"
                      options={aliases.map((a) => ({
                        value: a.id,
                        label: a.name,
                      }))}
                      values={selectedAliases ?? []}
                      onChange={(v) => setSelectedAliases(v.length ? v : null)}
                    />
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
                >
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
                >
                  Asesor
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
                >
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
                        <SheetActiveFill
                          metric={m.key}
                          name={m.name}
                          day={d}
                          disabled={busy || !data}
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
                          onResize={(w) => resizeColumn(d + m.key, w)}
                          onReset={() => resizeColumn(d + m.key)}
                        />
                      </th>
                    )),
                  )}
                </tr>
              )}
            </thead>
            <tbody>
              {rows.map((r) => {
                const name = names.get(r.aliasId) ?? "Inventario";
                return (
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
                  >
                    <td className="effectiveness-name">
                      <div className="sheet-alias-row">
                        <input
                          type="checkbox"
                          className="sheet-alias-select"
                          aria-label={`Seleccionar ${name} ${r.country || "sin país"}`}
                          checked={selectedPairSet.has(activationKey(r))}
                          disabled={busy || !r.country}
                          title={
                            !r.country
                              ? "Elige un país para activar o desactivar esta fila"
                              : `Seleccionar ${name} en ${r.country} para activación masiva`
                          }
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
                        <EffectivenessHistory
                          aliasId={r.aliasId}
                          country={r.country}
                          name={name}
                          initialSince={since}
                          initialUntil={until}
                        />
                      </div>
                    </td>
                    <td className="effectiveness-country">
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
                    <td className="effectiveness-advisor">
                      <div className="alias-advisor-actions">
                        <SheetSearchSelect
                          compact
                          displayLabel
                          placeholder="Sin asesor"
                          label={`Asesor de ${name} ${r.country}`}
                          value={r.advisorId ?? ""}
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

                    <td className="effectiveness-currency">
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
                    {days.flatMap((d) => {
                      const c = r.days[d],
                        partial = c && c.campaigns < r.campaigns;
                      const cells = sheetMetrics.map((m) => {
                        const cellColor = sheetCellColor(
                          colorRules,
                          m.key,
                          d,
                          c?.na?.includes(m.key) ? "NA" : (c?.[m.key] ?? null),
                          r.currency || "USD",
                        );
                        return (
                          <td
                            key={d + m.label}
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
                                  ((partial && !c?.manual?.includes(m.key)) ||
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
                              manual={c?.manual?.includes(m.key)}
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
                              hint={`${c?.automaticNa?.includes(m.key) ? "N.A. automático por desactivación; vuelve a vacío al activar. " : ""}${c?.synced?.[m.key] ? "Sincronizado desde «" + c.synced[m.key] + "». " : ""}${c?.manual?.includes(m.key) ? "Ajuste manual de Efectividad. Originales conservados. " : ""}${m.key === "spend" ? "Original Meta: " + (c?.sourceSpend.map((x) => x.currency + " " + x.amount).join(" + ") || "sin datos") + ". " : ""}${c?.fxMissing && c?.[m.key] === null && !c.na?.includes(m.key) ? "Sin tasa. " : ""}${partial || c?.partialMetrics?.includes(m.key) ? "Cobertura parcial. " : ""}${m.key === "fixedCost" ? "Original CF: " + (c?.sourceFixedCost.map((x) => x.currency + " " + x.amount).join(" + ") || "sin datos") + ". " : ""}${m.money ? c?.fx.map((f) => `${f.date}: 1 ${f.from} = ${f.rate} ${f.to} · ${f.source}`).join("; ") || "" : ""} Escribe un número o N.A.; vacío restaura el importado en B/G; en P borra el presupuesto.`}
                            />
                            {m.key === "sales" && r.advisorChanges?.[d] && (
                              <button
                                type="button"
                                className="sheet-advisor-change"
                                data-approved={
                                  r.advisorChanges[d].status === "APPROVED"
                                }
                                aria-label={`Reparto de ventas ${name} ${r.country} ${d}`}
                                title={
                                  (d === today
                                    ? "Hoy hubo cambio de asesor"
                                    : "Hubo cambio de asesor") +
                                  " · " +
                                  (r.advisorChanges[d].status === "APPROVED"
                                    ? "Reparto aprobado"
                                    : "Revisar y aprobar reparto")
                                }
                                onClick={() =>
                                  setSalesReview({
                                    aliasId: r.aliasId,
                                    country: r.country,
                                    day: d,
                                  })
                                }
                              >
                                {r.advisorChanges[d].status === "APPROVED"
                                  ? "✓ Aprobado"
                                  : "↔ Cambio asesor"}
                              </button>
                            )}
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
                );
              })}
              <tr className="sheet-new-row">
                <td className="effectiveness-name">
                  <SheetSearchSelect
                    key={inventoryId}
                    label="Seleccionar o crear inventario para añadir"
                    placeholder="Selecciona o escribe uno nuevo…"
                    value={newName}
                    options={inventoryNames.map((name) => ({
                      value: name,
                      label: name,
                    }))}
                    disabled={busy || inventoryState?.listId !== inventoryId}
                    onSelect={setNewName}
                    onCreate={setNewName}
                  />
                </td>
                <td className="effectiveness-country">
                  <SheetSearchSelect
                    compact
                    placeholder="—"
                    label="País del nuevo inventario"
                    value={newCountry}
                    options={[
                      { value: "", label: "Sin asignar" },
                      ...countries,
                    ]}
                    onSelect={setNewCountry}
                  />
                </td>
                <td className="effectiveness-advisor">
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

                <td className="effectiveness-currency">
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
                    {!data && <span role="status"> Cargando datos…</span>}
                  </td>
                )}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
