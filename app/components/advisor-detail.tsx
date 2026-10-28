"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { engineRequest as api } from "./generation-engine";
import { performanceRatio } from "../../lib/meta-ads/performance-metrics";
import { DetailPeriodPresets } from "./detail-period-presets";
import { MetaDateRange } from "./meta-date-range";
import { limaToday, shiftDay } from "./date-range";
import { SheetSearchSelect } from "./sheet-search-select";
import { AdvisorPeriodHistory } from "./advisor-period-history";
import { AdvisorItemAnalysis } from "./advisor-item-analysis";
import { AdvisorScatter } from "./advisor-scatter";
import { activePeriodWindow } from "../../lib/meta-ads/active-periods";
import type { AdvisorPeriodView } from "../../lib/meta-ads/advisor-period-history";
import { DetailSection, DetailSections } from "./detail-section";
import {
  DetailModuleLayout,
  DetailModuleSlot,
  DetailLayoutA11y,
  useAdvisorModuleLayout,
} from "./detail-module-layout";
import type { AdvisorModuleId } from "../../lib/meta-ads/advisor-detail-layout";
import { DetailStickyHeader } from "./detail-sticky-header";
import { DetailNavigation } from "./detail-navigation";
import { MetaDailyChart } from "./meta-daily-chart";
import { countryOptions } from "../../lib/meta-ads/countries";
import { subscribeAdvisorSalesChanged } from "./advisor-sales-events";
import { advisorAttendanceValue } from "../../lib/meta-ads/advisor-metrics";
import type { DailyChartMetric } from "../../lib/meta-ads/daily-chart";
import type {
  AdvisorPerson,
  AdvisorSheetData,
  AdvisorTable,
} from "./advisor-types";
const number = (v: number) =>
  new Intl.NumberFormat("es-PE", { maximumFractionDigits: 6 }).format(v);
const attendance = (v: string | null) =>
  v === "PRESENT"
    ? "Presente"
    : v === "ABSENT"
      ? "Ausente"
      : v === "NA"
        ? "N.A."
        : "—";
type AdvisorMetric =
  DailyChartMetric | "absences" | "advisorBase" | "manualBase";
const options = [
  { value: "results", label: "Ventas (V)" },
  { value: "manualBase", label: "Base manual (BM)" },
  { value: "advisorBase", label: "Base por contactar (BC)" },
  { value: "cost", label: "Horas ausentes (H)" },
  { value: "spend", label: "Asistencia (A)" },
  { value: "absences", label: "Inasistencias (I)" },
];
export function AdvisorDetail({
  person,
  tables,
  initialTableId,
  initialAliasId,
  initialCountry,
  initialSince,
  initialUntil,
  onClose,
  openRequest = 0,
  onOpenPeriod,
}: {
  person: AdvisorPerson;
  tables: AdvisorTable[];
  initialTableId: string;
  initialAliasId: string;
  initialCountry: string;
  initialSince: string;
  initialUntil: string;
  onClose: () => void;
  openRequest?: number;
  onOpenPeriod?: (period: AdvisorPeriodView) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const sectionId = useId();
  const [minimized, setMinimized] = useState(false);
  const restore = () => {
    setMinimized(false);
    requestAnimationFrame(() => {
      if (!dialog.current?.open) dialog.current?.showModal();
    });
  };
  const [tableId, setTableId] = useState(initialTableId),
    [aliasId, setAliasId] = useState(initialAliasId),
    [country, setCountry] = useState(initialCountry),
    [since, setSince] = useState(initialSince),
    [until, setUntil] = useState(initialUntil),
    [bars, setBars] = useState<AdvisorMetric>("results"),
    [line, setLine] = useState<AdvisorMetric>("cost"),
    [data, setData] = useState<AdvisorSheetData | null>(null),
    [message, setMessage] = useState(""),
    [loading, setLoading] = useState(true),
    [reload, setReload] = useState(0);
  const [analysisView, setAnalysisView] = useState<
    "period" | "today" | "yesterday"
  >("period");
  const customRange = useRef({ since: initialSince, until: initialUntil });
  const selectAnalysis = (view: "period" | "today" | "yesterday") => {
    if (analysisView === "period") customRange.current = { since, until };
    const range =
      view === "period"
        ? customRange.current
        : {
            since: view === "today" ? limaToday() : shiftDay(limaToday(), -1),
            until: view === "today" ? limaToday() : shiftDay(limaToday(), -1),
          };
    setAnalysisView(view);
    setSince(range.since);
    setUntil(range.until);
    setSelectedPeriod(null);
    previousView.current = null;
    setDayPage(0);
    setBars("results");
    setLine(
      view === "today"
        ? "advisorBase"
        : view === "yesterday"
          ? "manualBase"
          : "cost",
    );
  };
  const showBM = analysisView !== "today",
    showBC = analysisView !== "yesterday";
  const metricOptions = options.filter(
    (o) =>
      (showBM || o.value !== "manualBase") &&
      (showBC || o.value !== "advisorBase"),
  );
  const [selectedPeriod, setSelectedPeriod] =
      useState<AdvisorPeriodView | null>(null),
    [analysisAdvisor, setAnalysisAdvisor] = useState(person.id),
    [people, setPeople] = useState<
      { id: string; name: string; label?: string }[]
    >([]),
    [chartMode, setChartMode] = useState<"date" | "xy">("date"),
    [dayPage, setDayPage] = useState(0);
  const previousView = useRef<{
      tableId: string;
      aliasId: string;
      country: string;
      since: string;
      until: string;
      advisorId: string;
    } | null>(null),
    acceptedQuery = useRef("");
  useEffect(() => {
    let active = true;
    void api("meta-ads/advisors")
      .then((v) => {
        if (active) setPeople(v);
      })
      .catch((e) => {
        if (active) setMessage(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  const selectPeriod = (p: AdvisorPeriodView) => {
    if (!p.since || !p.from) return;
    setAnalysisView("period");
    previousView.current ??= {
      tableId,
      aliasId,
      country,
      since,
      until,
      advisorId: analysisAdvisor,
    };
    setTableId(p.tableId);
    setAliasId(p.aliasId);
    setCountry(p.country);
    setSince(p.since);
    setUntil(p.through);
    setAnalysisAdvisor(p.advisorId);
    setSelectedPeriod(p);
    setDayPage(0);
  };
  const clearPeriod = () => {
    const old = previousView.current;
    setSelectedPeriod(null);
    previousView.current = null;
    if (old) {
      setTableId(old.tableId);
      setAliasId(old.aliasId);
      setCountry(old.country);
      setSince(old.since);
      setUntil(old.until);
      setAnalysisAdvisor(old.advisorId);
    }
    setDayPage(0);
  };
  const valid =
    since <= until && (Date.parse(until) - Date.parse(since)) / 86400000 < 3660;
  const moduleLayout = useAdvisorModuleLayout(analysisAdvisor);
  const query =
    "meta-ads/advisors/detail?" +
    new URLSearchParams({
      advisorId: analysisAdvisor,
      tableId,
      since,
      until,
      ...(aliasId ? { aliasId } : {}),
      ...(country ? { country } : {}),
      ...(selectedPeriod ? { periodId: selectedPeriod.id } : {}),
    });
  useEffect(() => {
    setMinimized(false);
    const frame = requestAnimationFrame(() => {
      if (!dialog.current?.open) dialog.current?.showModal();
    });
    return () => cancelAnimationFrame(frame);
  }, [openRequest]);
  useEffect(() => {
    if (minimized) return;
    let active = true,
      version = 0;
    if (!valid) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setMessage("");
    setDayPage(0);
    if (acceptedQuery.current !== query) setData(null);
    let inFlight = false;
    const load = async () => {
      if (document.hidden || inFlight) return;
      inFlight = true;
      const seq = ++version;
      try {
        const windows: { since: string; until: string }[] = [];
        let first = since;
        while (first <= until) {
          const w = activePeriodWindow(since, until, first);
          windows.push({ since: w.since, until: w.until });
          if (!w.next) break;
          first = w.next;
        }
        const pages: AdvisorSheetData[] = [];
        for (let i = 0; i < windows.length; i += 2) {
          if (!active || seq !== version) return;
          const next = await Promise.all(
            windows.slice(i, i + 2).map((w) =>
              api(
                "meta-ads/advisors/detail?" +
                  new URLSearchParams({
                    advisorId: analysisAdvisor,
                    tableId,
                    ...w,
                    ...(aliasId ? { aliasId } : {}),
                    ...(country ? { country } : {}),
                    ...(selectedPeriod ? { periodId: selectedPeriod.id } : {}),
                  }),
              ),
            ),
          );
          if (!active || seq !== version) return;
          pages.push(...next);
        }
        if (active && seq === version) {
          const base = pages[0],
            sources = new Map<string, AdvisorSheetData["breakdown"][number]>();
          for (const p of pages)
            for (const source of p.breakdown) {
              const key = JSON.stringify([
                  source.tableId,
                  source.aliasId,
                  source.country,
                  source.advisorId,
                ]),
                old = sources.get(key);
              sources.set(key, {
                ...source,
                days: { ...old?.days, ...source.days },
              });
            }
          const days = Object.assign(
            {},
            ...pages.map(
              (p) => p.rows.find((r) => r.id === analysisAdvisor)?.days ?? {},
            ),
          );
          setData({
            ...base,
            since,
            until,
            rows: base.rows.some((r) => r.id === analysisAdvisor)
              ? [{ ...base.rows.find((r) => r.id === analysisAdvisor)!, days }]
              : [],
            breakdown: [...sources.values()].filter(
              (r) => r.advisorId === analysisAdvisor,
            ),
            manualBaseBreakdown: pages.flatMap(
              (p) => p.manualBaseBreakdown ?? [],
            ),
            advisorBaseBreakdown: pages.flatMap(
              (p) => p.advisorBaseBreakdown ?? [],
            ),
            assignedBaseEstimate: {
              scope: "ASSIGNED_FULL_DAY_ESTIMATE",
              advisorId: analysisAdvisor,
              days: Object.assign(
                {},
                ...pages.map((p) => p.assignedBaseEstimate?.days ?? {}),
              ),
            },
            baseContext: {
              scope: "INVENTORY_COUNTRY",
              days: Object.assign(
                {},
                ...pages.map((p) => p.baseContext?.days ?? {}),
              ),
            },
          });
          acceptedQuery.current = query;
          setMessage("");
        }
      } catch (e) {
        if (active && seq === version)
          setMessage(
            e instanceof Error ? e.message : "No se pudo cargar el detalle.",
          );
      } finally {
        inFlight = false;
        if (active && seq === version) setLoading(false);
      }
    };
    void load();
    const timer = setInterval(() => void load(), 30000),
      unsubscribe = subscribeAdvisorSalesChanged(() => void load());
    return () => {
      active = false;
      clearInterval(timer);
      unsubscribe();
    };
  }, [query, valid, reload, minimized]);
  const row =
      acceptedQuery.current === query
        ? data?.rows.find((p) => p.id === analysisAdvisor)
        : undefined,
    days = row ? Object.keys(row.days).sort() : [];
  const advisorName =
    row?.name ??
    people.find((p) => p.id === analysisAdvisor)?.name ??
    person.name;
  const known = days.filter(
      (d) => row!.days[d].sales !== null && !row!.days[d].na,
    ),
    sales = known.length
      ? known.reduce((s, d) => s + row!.days[d].sales!, 0)
      : null;
  const hourDays = days.filter((d) => row!.days[d].absence.hours !== null),
    hours = hourDays.length
      ? hourDays.reduce((s, d) => s + row!.days[d].absence.hours!, 0)
      : null,
    pending = days.reduce((s, d) => s + row!.days[d].absence.pending, 0);
  const present = days.filter((d) => row!.days[d].status === "PRESENT").length,
    absent = days.filter((d) => row!.days[d].status === "ABSENT").length;
  const recordedAttendance = days.filter(
    (d) => advisorAttendanceValue(row!.days[d].status, "attendance") !== null,
  ).length;
  const metricValue = (metric: AdvisorMetric, day: string) => {
    const c = row!.days[day];
    return metric === "manualBase"
      ? (c.manualBase ?? null)
      : metric === "advisorBase"
        ? (c.advisorBase ?? null)
        : metric === "results"
          ? c.sales
          : metric === "cost"
            ? c.absence.hours
            : advisorAttendanceValue(
                c.status,
                metric === "absences" ? "absences" : "attendance",
              );
  };
  const metricLabel = (metric: AdvisorMetric) =>
    options.find((o) => o.value === metric)!.label;
  const chart = days.map((day) => ({
    day,
    results: metricValue(bars, day),
    cost: metricValue(line, day),
    spend: null,
  }));

  const bmDays = days.filter(
    (d) =>
      row?.days[d].manualBase !== null && row?.days[d].manualBase !== undefined,
  );
  const bmTotal = bmDays.length
    ? bmDays.reduce((n, d) => n + (row!.days[d].manualBase ?? 0), 0)
    : null;
  const baseDays = days.filter(
    (d) =>
      row?.days[d].advisorBase !== null &&
      row?.days[d].advisorBase !== undefined,
  );
  const basePartial = baseDays.length > 0 && baseDays.length < days.length;
  const baseTotal = baseDays.length
    ? baseDays.reduce((sum, d) => sum + (row!.days[d].advisorBase ?? 0), 0)
    : null;
  const pageCount = Math.max(1, Math.ceil(days.length / 31)),
    currentDayPage = Math.min(dayPage, pageCount - 1),
    visibleDays = days.slice(currentDayPage * 31, currentDayPage * 31 + 31);
  const hasSales = (range: string[]) =>
    !!data?.breakdown.some((source) =>
      range.some((day) => {
        const cell = source.days[day];
        return !!cell && !cell.na && cell.sales !== null && cell.sales > 0;
      }),
    );
  const periodHasSales = hasSales(days);
  const pageHasSales = hasSales(visibleDays);
  const partial = days.some((d) => row!.days[d].partial);
  const summary = row ? (
    <div className="advisor-detail-summary" aria-label="Resumen del asesor">
      {showBM && (
        <span>
          Base manual (BM)
          <strong>
            {bmTotal === null ? "—" : number(bmTotal)}
            {bmDays.length > 0 && bmDays.length < days.length ? " *" : ""}
          </strong>
          <small>
            Recibida de Totales por hoja y país · solo lectura. Base del día
            completo, registrada al día siguiente. {bmDays.length}/{days.length}{" "}
            días con BM registrada.
          </small>
        </span>
      )}
      {showBM && (
        <span>
          Ventas / BM
          <strong>
            {!aliasId && sales !== null && bmTotal !== null && bmTotal > 0
              ? performanceRatio(sales, bmTotal, 100)!.toLocaleString("es-PE", {
                  maximumFractionDigits: 2,
                }) + " %"
              : "—"}
            {!aliasId &&
            sales !== null &&
            bmTotal !== null &&
            bmTotal > 0 &&
            (partial || bmDays.length < days.length)
              ? " *"
              : ""}
          </strong>
          <small>
            {aliasId
              ? "BM corresponde a la hoja completa; quita el filtro de inventario para comparar."
              : "Ventas registradas respecto a la base manual del período"}
          </small>
        </span>
      )}
      {showBC && (
        <span>
          Base por contactar (BC)
          <b>
            {baseTotal === null ? "—" : number(baseTotal)}
            {basePartial ? " *" : ""}
          </b>
          <small>
            {baseDays.length}/{days.length} días con BC registrada manualmente
            en Totales. Es la base que el asesor declara disponible para
            contactar; no equivale necesariamente a los ingresos de 00:00 a
            00:00.
          </small>
        </span>
      )}
      {showBC && (
        <span>
          Ventas / BC
          <strong>
            {!aliasId && performanceRatio(sales, baseTotal, 100) !== null
              ? performanceRatio(sales, baseTotal, 100)!.toLocaleString(
                  "es-PE",
                  { maximumFractionDigits: 2 },
                ) + " %"
              : "—"}
            {!aliasId &&
            performanceRatio(sales, baseTotal, 100) !== null &&
            (partial || basePartial)
              ? " *"
              : ""}
          </strong>
          <small>
            {aliasId
              ? "BC corresponde a la hoja completa; quita el filtro de inventario para comparar."
              : "Ventas registradas respecto a la base disponible para contactar"}
          </small>
        </span>
      )}
      <span>
        Ventas (V)
        <strong>
          {sales === null ? "—" : number(sales)}
          {partial ? " *" : ""}
        </strong>
      </span>
      <span>
        Promedio por día con V
        <strong>{sales === null ? "—" : number(sales / known.length)}</strong>
        <small>
          {known.length}/{days.length} días con ventas registradas
        </small>
      </span>
      <span>
        Horas ausentes (H)
        <strong>
          {hours === null ? "—" : number(hours) + " h"}
          {pending ? " +" : ""}
        </strong>
        <small>{pending} regreso(s) pendiente(s)</small>
      </span>
      <span>
        Asistencia (A)
        <strong>
          {present} presente(s) · {absent} ausente(s)
        </strong>
      </span>
      <span data-advisor-summary="absences">
        Inasistencias (I)
        <strong>{recordedAttendance ? absent : "—"}</strong>
        <small>
          {recordedAttendance}/{days.length} días con asistencia registrada
        </small>
      </span>
    </div>
  ) : null;
  const modules: Record<AdvisorModuleId, ReactNode> = {
    "sold-days": row ? (
      <DetailSection
        id={sectionId + "sold-days"}
        stateKey="sold-days"
        className="advisor-sales-by-day"
        title={`Qué vendió cada día · ${visibleDays[0]} — ${visibleDays.at(-1)}`}
        tone="sold"
      >
        {!periodHasSales ? (
          <p role="status">No vendió nada en este período.</p>
        ) : !pageHasSales ? (
          <p role="status">
            No hay ventas en estos días. Hay ventas en otras fechas del período;
            usa Días anteriores o Días siguientes en el histórico.
          </p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Hoja</th>
                  <th>Diplomado / inventario</th>
                  <th>País</th>
                  <th>Asesor</th>
                  <th>Ventas (V)</th>
                </tr>
              </thead>
              <tbody>
                {visibleDays.flatMap((day) =>
                  data!.breakdown.map((source) => {
                    const c = source.days[day];
                    if (!c || (c.sales === null && !c.na && !c.partial))
                      return null;
                    return (
                      <tr
                        key={JSON.stringify([
                          day,
                          source.tableId,
                          source.aliasId,
                          source.country,
                        ])}
                      >
                        <td>{day}</td>
                        <td>{source.tableName}</td>
                        <td>{source.alias}</td>
                        <td>{source.country}</td>
                        <td>{row.name}</td>
                        <td>
                          {c.na
                            ? "N.A."
                            : c.sales === null
                              ? "—"
                              : number(c.sales)}
                          {c.partial ? " *" : ""}
                        </td>
                      </tr>
                    );
                  }),
                )}
              </tbody>
            </table>
          </div>
        )}
      </DetailSection>
    ) : null,
    days: row ? (
      <DetailSection
        id={sectionId + "days"}
        stateKey="days"
        title={`Histórico diario de ventas · ${row.name}`}
        tone="daily"
      >
        {pageCount > 1 && (
          <nav
            className="alias-period-pagination"
            aria-label="Páginas del histórico diario"
          >
            <span>
              {currentDayPage * 31 + 1}–
              {Math.min((currentDayPage + 1) * 31, days.length)} de{" "}
              {days.length} días; totales y gráficos de todo el período
            </span>
            <div className="row">
              <button
                disabled={currentDayPage === 0}
                onClick={() => setDayPage(currentDayPage - 1)}
              >
                Días anteriores
              </button>
              <button
                disabled={currentDayPage + 1 >= pageCount}
                onClick={() => setDayPage(currentDayPage + 1)}
              >
                Días siguientes
              </button>
            </div>
          </nav>
        )}
        <div className="table-scroll">
          <table className="advisor-detail-days">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>A</th>
                <th>H</th>
                <th title="Inasistencias">I</th>
                <th>V</th>
                {showBM && <th>BM</th>}
                {showBC && <th title="Base por contactar">BC</th>}
                <th>Salidas y regresos · Lima</th>
              </tr>
            </thead>
            <tbody>
              {visibleDays.map((day) => {
                const c = row.days[day];
                return (
                  <tr key={day}>
                    <th>{day}</th>
                    <td>{attendance(c.status)}</td>
                    <td>
                      {c.absence.hours === null ? "—" : number(c.absence.hours)}
                      {c.absence.pending ? " +" : ""}
                    </td>
                    <td>
                      {advisorAttendanceValue(c.status, "absences") ??
                        (c.status === "NA" ? "N.A." : "—")}
                    </td>
                    <td>
                      {c.na ? "N.A." : c.sales === null ? "—" : number(c.sales)}
                      {c.partial ? " *" : ""}
                    </td>
                    {showBM && (
                      <td>
                        {c.manualBase === null || c.manualBase === undefined
                          ? "—"
                          : number(c.manualBase)}
                      </td>
                    )}
                    {showBC && (
                      <td>
                        {c.advisorBase === null || c.advisorBase === undefined
                          ? "—"
                          : number(c.advisorBase)}
                      </td>
                    )}
                    <td>
                      {c.absence.mode === "CLOCK"
                        ? c.absence.intervals
                            .map(
                              (i) =>
                                `${i.start} → ${i.end ?? "regreso pendiente"}${i.nextDay ? " (+1 día)" : ""}`,
                            )
                            .join("; ")
                        : c.absence.hours === null
                          ? "—"
                          : "Horas decimales manuales"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </DetailSection>
    ) : null,
    chart: row ? (
      <DetailSection
        id={sectionId + "chart"}
        stateKey="chart"
        title="Estadísticas del período"
        tone="parameters"
      >
        <div
          className="row advisor-chart-modes"
          role="group"
          aria-label="Vista de estadísticas"
        >
          <button
            aria-pressed={chartMode === "date"}
            onClick={() => setChartMode("date")}
          >
            Por fecha: barras y línea
          </button>
          <button
            aria-pressed={chartMode === "xy"}
            onClick={() => setChartMode("xy")}
          >
            Comparar parámetros X/Y
          </button>
        </div>
        <div className="row advisor-detail-controls">
          <label>
            {chartMode === "date" ? "1 · Barras" : "Eje X"}
            <select
              aria-label="Barras del detalle del asesor"
              value={bars}
              onChange={(e) => {
                const v = e.target.value as AdvisorMetric;
                setBars(v);
                if (v === line) setLine(v === "results" ? "cost" : "results");
              }}
            >
              {metricOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            {chartMode === "date" ? "2 · Línea con puntos" : "Eje Y"}
            <select
              aria-label="Línea del detalle del asesor"
              value={line}
              onChange={(e) => {
                const v = e.target.value as AdvisorMetric;
                setLine(v);
                if (v === bars) setBars(v === "results" ? "cost" : "results");
              }}
            >
              {metricOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {chartMode === "xy" ? (
          <AdvisorScatter
            rows={days.map((day) => ({
              day,
              x: metricValue(bars, day),
              y: metricValue(line, day),
            }))}
            xLabel={metricLabel(bars)}
            yLabel={metricLabel(line)}
          />
        ) : (
          <>
            {" "}
            <MetaDailyChart
              rows={chart}
              bars="results"
              line="cost"
              currency="PEN"
              metricName="Ventas"
              since={since}
              until={until}
              labels={{
                results: metricLabel(bars),
                cost: metricLabel(line),
                spend: "Asistencia (A)",
              }}
              units={{
                results: bars === "cost" ? "hours" : "count",
                cost: line === "cost" ? "hours" : "count",
                spend: "count",
              }}
            />
          </>
        )}
        <p className="hint">
          Escalas independientes. A: 1 = Presente, 0 = Ausente. I: 1 = Ausente,
          0 = Presente; N.A. y vacío dejan un hueco. V y H no imputan ceros a
          los días sin datos. H muestra solo horas confirmadas; + indica regreso
          pendiente. * Cobertura parcial. Las ventas respetan cada tramo de
          asignación y los cortes registrados; no se reparten por horas. Las
          asignaciones antiguas sin historial conservan su atribución previa.
        </p>
        <p className="hint">
          BC es la base por contactar registrada manualmente en Totales por
          hoja, país y fecha. No se calcula por asignaciones ni se copia de B de
          Meta Ads o BM. BC no se atribuye a un diplomado concreto y no cambia
          al filtrar productos. Las ventas V corresponden al reparto registrado
          para cada persona; A/I/H son registros diarios del asesor.
        </p>
      </DetailSection>
    ) : null,
    products: row ? (
      <DetailSection
        id={sectionId + "products"}
        stateKey="products"
        title="Ventas por producto y país · origen de la suma"
        tone="products"
      >
        <div className="table-scroll advisor-source-scroll">
          <table className="advisor-source-breakdown">
            <thead>
              <tr>
                <th>Hoja</th>
                <th>Inventario</th>
                <th>País</th>
                <th>Asesor</th>
                <th>V del período</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data!.breakdown.map((source) => {
                const cells = Object.values(source.days),
                  known = cells.filter((c) => c.sales !== null && !c.na);
                return (
                  <tr
                    key={JSON.stringify([
                      source.tableId,
                      source.aliasId,
                      source.country,
                    ])}
                    data-source-alias={source.aliasId}
                    data-source-country={source.country}
                  >
                    <td>{source.tableName}</td>
                    <td>{source.alias}</td>
                    <td>{source.country}</td>
                    <td>{row.name}</td>
                    <td>
                      {known.length
                        ? number(known.reduce((s, c) => s + c.sales!, 0))
                        : cells.every((c) => c.na)
                          ? "N.A."
                          : "—"}
                      {known.length &&
                      cells.some(
                        (c) => c.partial || (!c.na && c.sales === null),
                      )
                        ? " *"
                        : ""}
                    </td>
                    <td>
                      <button
                        type="button"
                        onClick={() => {
                          setTableId(source.tableId);
                          setAliasId(source.aliasId);
                          setCountry(source.country);
                        }}
                      >
                        Ver esta combinación
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!data!.breakdown.length && (
          <p>No hay filas con esa coincidencia de inventario, asesor y país.</p>
        )}
      </DetailSection>
    ) : null,
    "inventory-analysis":
      !selectedPeriod && valid ? (
        <AdvisorItemAnalysis
          sectionId={sectionId + "inventory-analysis"}
          tableId={tableId}
          aliasId={aliasId}
          country={country}
          since={since}
          until={until}
          advisorId={analysisAdvisor}
          advisorName={advisorName}
        >
          {summary}
        </AdvisorItemAnalysis>
      ) : null,
    assignments: true ? (
      <AdvisorPeriodHistory
        sectionId={sectionId + "assignments"}
        advisorId={analysisAdvisor}
        title="Estadísticas de asesores"
        tableId={tableId}
        aliasId={aliasId}
        country={country}
        onStatistics={selectPeriod}
      >
        {row && (
          <>
            <h4>BM y BC por hoja y país</h4>
            <p className="hint">
              BM y BC son repartos manuales independientes de esta persona. No
              se calculan por asignaciones ni se convierten por moneda; no
              dependen del filtro de diplomado.
            </p>
            <div className="table-scroll advisor-source-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Hoja</th>
                    <th>País</th>
                    <th>BM</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.manualBaseBreakdown ?? [])
                    .filter(
                      (r) =>
                        r.advisorId === analysisAdvisor &&
                        visibleDays.includes(r.day),
                    )
                    .map((r) => (
                      <tr
                        key={JSON.stringify([
                          r.tableId,
                          r.country,
                          r.day,
                          r.advisorId,
                        ])}
                      >
                        <th>{r.day}</th>
                        <td>{r.tableName}</td>
                        <td>{r.country || "Sin país"}</td>
                        <td>{number(r.quantity)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            {!!data?.advisorBaseBreakdown?.length && (
              <div className="table-scroll advisor-source-scroll">
                <table>
                  <caption>Base por contactar (BC)</caption>
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Hoja</th>
                      <th>País</th>
                      <th>BC</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.advisorBaseBreakdown
                      .filter(
                        (r) =>
                          r.advisorId === analysisAdvisor &&
                          visibleDays.includes(r.day),
                      )
                      .map((r) => (
                        <tr key={JSON.stringify([r.tableId, r.country, r.day])}>
                          <th>{r.day}</th>
                          <td>{r.tableName}</td>
                          <td>{r.country || "Sin país"}</td>
                          <td>{number(r.quantity)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </AdvisorPeriodHistory>
    ) : null,
  };
  return (
    <DetailSections>
      <DetailModuleLayout
        scope={analysisAdvisor}
        rows={moduleLayout.rows}
        move={moduleLayout.move}
      >
        {minimized && (
          <button
            type="button"
            className="advisor-detail-restore"
            onClick={restore}
            aria-label={`Restaurar detalle de ${advisorName}`}
          >
            ↗ Restaurar detalle · {advisorName}
          </button>
        )}
        <dialog
          ref={dialog}
          className="meta-detail advisor-detail"
          hidden={minimized}
          aria-label={`Detalle de asesor ${advisorName}`}
          onCancel={onClose}
        >
          <DetailLayoutA11y />
          <DetailStickyHeader>
            <header className="row advisor-detail-heading">
              <h2>{advisorName}</h2>
            </header>
            <DetailNavigation
              onClose={onClose}
              items={[
                {
                  target: sectionId + "inventory-analysis",
                  label: "Ventas por asesor",
                  tone: "sales",
                },
                {
                  target: sectionId + "sold-days",
                  label: "Qué vendió cada día",
                  tone: "sold",
                },
                {
                  target: sectionId + "days",
                  label: "Histórico por día",
                  tone: "daily",
                },
                {
                  target: sectionId + "chart",
                  label: "Estadísticas",
                  tone: "parameters",
                },
                {
                  target: sectionId + "assignments",
                  label: "Estadísticas de asesores",
                  tone: "assignments",
                },
                {
                  target: sectionId + "products",
                  label: "Ventas por producto",
                  tone: "products",
                },
              ].sort(
                (a, b) =>
                  moduleLayout.rows
                    .flat()
                    .indexOf(
                      a.target.slice(sectionId.length) as AdvisorModuleId,
                    ) -
                  moduleLayout.rows
                    .flat()
                    .indexOf(
                      b.target.slice(sectionId.length) as AdvisorModuleId,
                    ),
              )}
              disabled={!row}
            />
            <div
              className="row"
              role="group"
              aria-label="Vista de análisis del asesor"
            >
              {(
                [
                  ["period", "Análisis del período"],
                  ["today", "Análisis de hoy"],
                  ["yesterday", "Análisis de ayer"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={analysisView === value}
                  onClick={() => selectAnalysis(value)}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="hint" role="status">
              {analysisView === "today"
                ? `Hoy · ${since} · Lima. Ventas / BC: base declarada para contactar hoy.`
                : analysisView === "yesterday"
                  ? `Ayer · ${since} · Lima. Ventas / BM: base del día completo, registrada al día siguiente.`
                  : "Período seleccionado: compara ventas con BM o BC, sin mezclar ambas bases."}{" "}
              * Cobertura parcial; — sin dato. Las bases se reciben de Totales y
              no se reparten por diplomado.
            </p>
            <div className="row advisor-detail-controls">
              <div className="advisor-period-controls">
                <MetaDateRange
                  maxDays={3660}
                  from={since}
                  to={until}
                  onChange={(a, b) => {
                    setAnalysisView("period");
                    customRange.current = { since: a, until: b };
                    setSelectedPeriod(null);
                    previousView.current = null;
                    setDayPage(0);
                    setSince(a);
                    setUntil(b);
                  }}
                />
                <DetailPeriodPresets
                  key={analysisAdvisor}
                  scope={"advisor-detail:" + analysisAdvisor}
                  sectionId={sectionId + "periods"}
                  since={since}
                  until={until}
                  onSelect={(a, b) => {
                    setAnalysisView("period");
                    customRange.current = { since: a, until: b };
                    setSelectedPeriod(null);
                    previousView.current = null;
                    setDayPage(0);
                    setSince(a);
                    setUntil(b);
                  }}
                />
              </div>
              <SheetSearchSelect
                label="Hoja del detalle del asesor"
                value={tableId}
                options={[
                  ...tables.map((t) => ({ value: t.id, label: t.name })),
                  { value: "all", label: "Todas las hojas" },
                ]}
                onSelect={(id) => {
                  setSelectedPeriod(null);
                  previousView.current = null;
                  setTableId(id);
                  setAliasId("");
                }}
              />
              <SheetSearchSelect
                label="Inventario del detalle del asesor"
                value={aliasId}
                placeholder="Todo el inventario"
                options={[
                  { value: "", label: "Todo el inventario" },
                  ...tables
                    .filter((t) => tableId === "all" || t.id === tableId)
                    .flatMap((t) =>
                      (t.aliases ?? []).map((a) => ({
                        value: a.id,
                        label:
                          a.name + (tableId === "all" ? " · " + t.name : ""),
                      })),
                    ),
                ]}
                onSelect={(v) => {
                  setSelectedPeriod(null);
                  previousView.current = null;
                  setAliasId(v);
                }}
              />
              <SheetSearchSelect
                label="País del detalle del asesor"
                value={country}
                placeholder="Todos los países"
                options={[
                  { value: "", label: "Todos los países" },
                  ...countryOptions.map((c) => ({
                    value: c.code,
                    label: c.code + " · " + c.name,
                  })),
                ]}
                onSelect={(v) => {
                  setSelectedPeriod(null);
                  previousView.current = null;
                  setCountry(v);
                }}
              />
              <button
                type="button"
                disabled={loading || !valid}
                onClick={() => setReload((v) => v + 1)}
              >
                Actualizar detalle
              </button>
            </div>
            {selectedPeriod ? (
              <div
                className="sheet-period-nav"
                role="region"
                aria-label="Estadísticas de la asignación"
              >
                <div>
                  <strong>
                    Estadísticas: {selectedPeriod.advisorName} ·{" "}
                    {selectedPeriod.alias} · {selectedPeriod.country}
                  </strong>
                  <small>
                    {selectedPeriod.kind === "SALES_DAY"
                      ? `Ventas registradas el ${selectedPeriod.since}`
                      : `${selectedPeriod.from ? new Date(selectedPeriod.from).toLocaleString("es-PE", { timeZone: "America/Lima" }) : "Inicio desconocido"} — ${selectedPeriod.until ? new Date(selectedPeriod.until).toLocaleString("es-PE", { timeZone: "America/Lima" }) : "hasta la fecha de consulta"}`}
                    . Período completo: {since} — {until}. Ventas según cortes y
                    repartos guardados; sin prorrateo por horas.
                  </small>
                </div>
                <button onClick={clearPeriod}>
                  Volver al análisis general
                </button>
              </div>
            ) : (
              <>
                <SheetSearchSelect
                  label="Asesor del análisis"
                  value={analysisAdvisor}
                  options={(people.length ? people : [person]).map((p) => ({
                    value: p.id,
                    label: ("label" in p ? p.label : undefined) ?? p.name,
                  }))}
                  onSelect={(id) => {
                    setAnalysisAdvisor(id);
                    setSelectedPeriod(null);
                  }}
                />
              </>
            )}
            <p className="hint">
              Ventas registradas por asesor en el inventario y país elegidos.
              Todos suma las combinaciones de las hojas elegidas; el desglose
              identifica cada producto. A, I y H corresponden al asesor,
              independientemente del producto. Las ausencias abiertas no se
              suman hasta registrar el regreso.
            </p>
          </DetailStickyHeader>
          {!valid && (
            <p role="alert">
              Elige un período válido de hasta diez años, sin fechas futuras.
            </p>
          )}
          {message && (
            <p className="sheet-message" role="alert">
              {message}
            </p>
          )}
          {loading && (
            <p role="status" className="sheet-loading-status">
              Cargando detalle…
            </p>
          )}

          {selectedPeriod && summary}
          <div className="advisor-module-grid">
            {moduleLayout.rows.flat().map((id) =>
              modules[id] ? (
                <DetailModuleSlot key={id} id={id}>
                  {modules[id]}
                </DetailModuleSlot>
              ) : null,
            )}
          </div>

          {moduleLayout.warning && <p role="status">{moduleLayout.warning}</p>}
          <footer className="advisor-detail-footer">
            {moduleLayout.custom && (
              <button
                type="button"
                className="detail-layout-reset"
                onClick={moduleLayout.reset}
              >
                Restablecer distribución
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                dialog.current?.close();
                setMinimized(true);
              }}
            >
              − Minimizar
            </button>
          </footer>
        </dialog>
      </DetailModuleLayout>
    </DetailSections>
  );
}
