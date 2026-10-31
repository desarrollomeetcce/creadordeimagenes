"use client";
import { summaryPeriod } from "../../lib/meta-ads/summary-period";
import { SummaryPeriodNotice } from "./summary-period-notice";
import { limaToday } from "./date-range";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  totalViewColumns,
  totalDetailViewNames,
  type TotalDetailView,
} from "../../lib/meta-ads/total-detail-views";
import {
  VerticalDetailLayout,
  InventoryDetailSlot,
} from "./inventory-detail-layout";
import { periodComparison } from "../../lib/meta-ads/period-comparison";
import { periodTableUrl } from "../../lib/meta-ads/period-table-link";
import { TotalsDailyBreakdown } from "./totals-daily-breakdown";
import { TotalsPeriodProducts } from "./totals-period-products";
import { useReportDayPages } from "./report-day-pages";
import { DetailSection, DetailSections } from "./detail-section";
import { DetailStickyHeader } from "./detail-sticky-header";
import { DetailNavigation } from "./detail-navigation";
import { MetaDailyChart } from "./meta-daily-chart";
import { SheetSearchSelect } from "./sheet-search-select";
import {
  formatTotalDetail as format,
  manualTotalColumns,
  automaticTotalColumns,
  totalDetailSummary,
  totalDetailValue,
  type TotalSheet,
  type TotalColumn,
} from "../../lib/meta-ads/totals-detail";
import { totalSourceBlocks } from "../../lib/meta-ads/total-source-blocks";
import { MetaDateRange } from "./meta-date-range";
import { DetailPeriodPresets } from "./detail-period-presets";
import { totalDetailPeriods } from "../../lib/meta-ads/detail-period-presets";
import { readTotalsRange } from "./workbook-range-request";
import { subscribeAdvisorSalesChanged } from "./advisor-sales-events";
const totalModuleIds = [
  "summary",
  "performance",
  "advisors",
  "products",
  "chart",
  "days",
] as const;
type Block = ReturnType<typeof totalSourceBlocks<TotalSheet>>[number];
export function TotalsDetail({
  blocks,
  days: initialDays,
  totalsSheetId = "default-totals",
  initialMode,
  initialView,
  initialSelection,
  loading: parentLoading,
  message,
  onClose,
}: {
  blocks: Block[];
  days: string[];
  totalsSheetId?: string;
  initialMode: "manual" | "automatic";
  initialView?: TotalDetailView;
  initialSelection?: { blockKey: string; day: string };
  loading: boolean;
  message: string;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const sectionId = useId();
  const [since, setSince] = useState(initialDays[0] ?? ""),
    [until, setUntil] = useState(initialDays.at(-1) ?? ""),
    [rangeResult, setRangeResult] = useState<{
      query: string;
      data: TotalSheet;
    } | null>(null),
    [rangeLoading, setRangeLoading] = useState(false),
    [rangeError, setRangeError] = useState(""),
    [reportBlocks, setReportBlocks] = useState<Block[]>([]);
  const days: string[] = [];
  if (
    since &&
    until &&
    since <= until &&
    (Date.parse(until) - Date.parse(since)) / 86400000 < 3660
  )
    for (let at = Date.parse(since); at <= Date.parse(until); at += 86400000)
      days.push(new Date(at).toISOString().slice(0, 10));
  const [mode, setMode] = useState<TotalDetailView>(initialView ?? initialMode),
    [blockKey, setBlockKey] = useState(
      initialSelection?.blockKey ?? blocks[0]?.key ?? "",
    ),
    [selectedDay, setSelectedDay] = useState(initialSelection?.day ?? ""),
    [bars, setBars] = useState("sales"),
    [line, setLine] = useState(
      initialView === "yesterday"
        ? "baseManual"
        : initialMode === "manual"
          ? "budget"
          : "base",
    );
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const { visibleDays, navigation } = useReportDayPages(days);
  const availableBlocks = [
    ...new Map([...blocks, ...reportBlocks].map((b) => [b.key, b])).values(),
  ];
  const block =
    availableBlocks.find((b) => b.key === blockKey) ?? availableBlocks[0];
  const tableId = block?.table.tableId ?? "";
  const rangeQuery = JSON.stringify([totalsSheetId, tableId, since, until]);
  useEffect(() => {
    if (
      !tableId ||
      !since ||
      !until ||
      since > until ||
      (Date.parse(until) - Date.parse(since)) / 86400000 >= 3660
    )
      return;
    let active = true,
      inFlight = false;
    setRangeLoading(true);
    setRangeError("");
    const load = async () => {
      if (!active || inFlight || document.hidden) return;
      inFlight = true;
      try {
        const data = await readTotalsRange(
          { sheetId: totalsSheetId, tableId, since, until },
          () => active,
        );
        if (active) {
          setRangeResult({ query: rangeQuery, data });
          // Keep country/currency choices discovered in historical periods, without retaining old values.
          const choices = totalSourceBlocks([data]).map((b) => ({
            ...b,
            table: { ...b.table, groups: [] },
          }));
          setReportBlocks((old) => [
            ...new Map([...old, ...choices].map((b) => [b.key, b])).values(),
          ]);
          setRangeError("");
        }
      } catch (e) {
        if (active)
          setRangeError(
            e instanceof Error ? e.message : "No se pudo consultar el período.",
          );
      } finally {
        inFlight = false;
        if (active) setRangeLoading(false);
      }
    };
    void load();
    const timer = setInterval(load, 30000),
      unsubscribe = subscribeAdvisorSalesChanged(load);
    return () => {
      active = false;
      clearInterval(timer);
      unsubscribe();
    };
  }, [rangeQuery]);
  const selectRange = (a: string, b: string) => {
    setSince(a);
    setUntil(b);
    setSelectedDay("");
  };
  const loading = parentLoading || rangeLoading;
  const focusDays = summaryPeriod(days, mode, limaToday()).days;
  const dayIndex = days.indexOf(selectedDay);
  const columns = totalViewColumns(mode);
  const comparisonColumns = columns;
  const barColumn = comparisonColumns.find((c) => c.key === bars) ?? columns[0],
    lineColumn = comparisonColumns.find((c) => c.key === line) ?? columns[1];
  const report =
    rangeResult?.query === rangeQuery
      ? rangeResult.data
      : since === initialDays[0] && until === initialDays.at(-1)
        ? blocks.find((b) => b.key === block?.key)?.table
        : undefined;
  const group = report?.groups.find(
    (g) => g.country === block.country && g.currency === block.currency,
  );
  const value = (day: string, column: TotalColumn) =>
    totalDetailValue(group?.days[day], column);
  const monetary = (column: TotalColumn) =>
    !["sales", "base", "baseManual", "advisorBase"].includes(column.key);
  const summarize = (column: TotalColumn) =>
    totalDetailSummary(focusDays.map((day) => value(day, column)));
  const sold = summarize(manualTotalColumns.find((c) => c.key === "sales")!),
    bm = summarize(manualTotalColumns.find((c) => c.key === "baseManual")!),
    ba = summarize(manualTotalColumns.find((c) => c.key === "advisorBase")!),
    gm = summarize(manualTotalColumns.find((c) => c.key === "totalSpend")!),
    base = summarize(automaticTotalColumns.find((c) => c.key === "base")!),
    spend = summarize(automaticTotalColumns.find((c) => c.key === "spend")!);
  const ratioColumn = (v: typeof sold): TotalColumn =>
    v === sold
      ? manualTotalColumns[0]
      : v === bm
        ? manualTotalColumns.find((c) => c.key === "baseManual")!
        : v === ba
          ? manualTotalColumns.find((c) => c.key === "advisorBase")!
          : v === gm
            ? manualTotalColumns.find((c) => c.key === "totalSpend")!
            : v === base
              ? automaticTotalColumns.find((c) => c.key === "base")!
              : automaticTotalColumns.find((c) => c.key === "spend")!;
  const ratios = [
    { name: "Ventas / BC", numerator: sold, denominator: ba, percent: true },
    { name: "Ventas / BM", numerator: sold, denominator: bm, percent: true },
    {
      name: "Costo por venta · GM",
      numerator: gm,
      denominator: sold,
      percent: false,
    },
    {
      name: "Costo por dato · GM/BM",
      numerator: gm,
      denominator: bm,
      percent: false,
    },
    {
      name: "Ventas / B Meta",
      numerator: sold,
      denominator: base,
      percent: true,
    },
    {
      name: "Costo por venta · G Meta",
      numerator: spend,
      denominator: sold,
      percent: false,
    },
    {
      name: "Costo por dato · G/B Meta",
      numerator: spend,
      denominator: base,
      percent: false,
    },
  ].filter((r) =>
    mode === "automatic"
      ? r.name.includes("Meta") || r.name === "Ventas / BC"
      : mode === "today"
        ? r.name === "Ventas / BC"
        : mode === "yesterday"
          ? !r.name.includes("Meta") && r.name !== "Ventas / BC"
          : !r.name.includes("Meta"),
  );
  const chartValue = (day: string, column: TotalColumn) =>
    value(day, column).value;
  return (
    <DetailSections>
      <VerticalDetailLayout modules={totalModuleIds} scope="totals">
        {(layout) => (
          <dialog
            ref={dialog}
            className="meta-detail totals-detail"
            aria-label="Detalle de Totales"
            onCancel={onClose}
          >
            <DetailStickyHeader>
              <header className="row">
                <h2>
                  Detalle de Totales
                  {block
                    ? ` · ${block.table.name} · ${block.country || "Sin país"} · ${block.currency || "Sin moneda"}${selectedDay ? ` · ${selectedDay}` : ""}`
                    : ""}
                </h2>
              </header>
              <DetailNavigation
                onClose={onClose}
                items={[
                  {
                    target: sectionId + "summary",
                    label: "Resumen",
                    tone: "sales",
                  },
                  {
                    target: sectionId + "performance",
                    label: "Desempeño",
                    tone: "activity",
                  },
                  {
                    target: sectionId + "chart",
                    label: "Estadísticas",
                    tone: "parameters",
                  },
                  {
                    target: sectionId + "days",
                    label: "Histórico por día",
                    tone: "daily",
                  },
                  ...(selectedDay
                    ? [
                        {
                          target: sectionId + "advisors",
                          label: "Asesores",
                          tone: "sales" as const,
                        },
                        {
                          target: sectionId + "products",
                          label: "Productos",
                          tone: "parameters" as const,
                        },
                      ]
                    : [
                        {
                          target: sectionId + "products",
                          label: "Diplomados",
                          tone: "parameters" as const,
                        },
                      ]),
                ].sort(
                  (a, b) =>
                    layout.order.indexOf(
                      a.target.slice(
                        sectionId.length,
                      ) as (typeof totalModuleIds)[number],
                    ) -
                    layout.order.indexOf(
                      b.target.slice(
                        sectionId.length,
                      ) as (typeof totalModuleIds)[number],
                    ),
                )}
                disabled={!block}
              />
              <div className="row advisor-detail-controls">
                {(Object.keys(totalDetailViewNames) as TotalDetailView[]).map(
                  (view) => (
                    <button
                      key={view}
                      type="button"
                      aria-pressed={mode === view}
                      onClick={() => {
                        setMode(view);
                      }}
                    >
                      {totalDetailViewNames[view]}
                    </button>
                  ),
                )}
                <SheetSearchSelect
                  label="Hoja, país y moneda del detalle de Totales"
                  value={block?.key ?? ""}
                  options={availableBlocks.map((b) => ({
                    value: b.key,
                    label: `${b.table.name} · ${b.country || "Sin país"} · ${b.currency || "Sin moneda"}`,
                  }))}
                  onSelect={setBlockKey}
                />
                <div className="totals-detail-period-controls">
                  <MetaDateRange
                    activityTableId={block?.table.tableId}
                    maxDays={3660}
                    from={since}
                    to={until}
                    onChange={selectRange}
                  />
                  <DetailPeriodPresets
                    key={block?.key}
                    scope={`totals-detail:${totalsSheetId}:${block?.key}`}
                    label="Períodos guardados de Totales"
                    defaults={totalDetailPeriods}
                    since={since}
                    until={until}
                    onSelect={selectRange}
                  />
                </div>
                <label>
                  Desglose de un día (opcional)
                  <select
                    aria-label="Fecha del detalle de Totales"
                    value={selectedDay}
                    onChange={(e) => setSelectedDay(e.target.value)}
                  >
                    <option value="">Todo el período</option>
                    {days.map((day) => (
                      <option key={day} value={day}>
                        {day.slice(8)}.{day.slice(5, 7)}.{day.slice(0, 4)}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  disabled={dayIndex <= 0}
                  onClick={() => setSelectedDay(days[dayIndex - 1])}
                >
                  ← Día anterior
                </button>
                <button
                  type="button"
                  disabled={dayIndex < 0 || dayIndex >= days.length - 1}
                  onClick={() => setSelectedDay(days[dayIndex + 1])}
                >
                  Día siguiente →
                </button>
              </div>
              <p className="hint">
                {selectedDay
                  ? "Resumen e indicadores del período, con el corte indicado en la franja. El día elegido solo filtra los desgloses diarios de asesores y productos."
                  : "Resumen e indicadores del período seleccionado, con el corte indicado en la franja."}{" "}
                Cada hoja, país y moneda se consulta por separado. V es la misma
                suma en ambas vistas.{" "}
                {mode === "automatic"
                  ? "B y G proceden de la vista automática; BC se ingresa por asesor; CF suma los costos de la hoja."
                  : "Parámetros de esta vista: " +
                    columns.map((c) => c.label).join(", ") +
                    ". Las bases y gastos manuales pertenecen a la hoja y país."}{" "}
                — sin dato; N.A. no suma; * cobertura parcial.
              </p>
            </DetailStickyHeader>
            {message && <p role="alert">{message}</p>}
            {rangeError && <p role="alert">{rangeError}</p>}
            {loading && <small role="status">Actualizando detalle…</small>}
            {!block ? (
              <p>
                Selecciona una hoja de origen en Totales para ver su detalle.
              </p>
            ) : (
              <>
                <a
                  className="button alias-period-link"
                  href={periodTableUrl({
                    tableId: block.table.tableId,
                    aliasId: "",
                    country: block.country,
                    since: days[0],
                    until: days.at(-1)!,
                  })}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Abrir los datos del período en una nueva ventana"
                >
                  Ir al período
                </a>
                {(() => {
                  const sections: Partial<
                    Record<(typeof totalModuleIds)[number], ReactNode>
                  > = {
                    summary: (
                      <DetailSection
                        id={sectionId + "summary"}
                        stateKey="summary"
                        title={`Resumen del período · ${since} — ${until}`}
                        tone="sales"
                      >
                        <div className="advisor-detail-summary totals-performance-summary">
                          <SummaryPeriodNotice
                            days={days}
                            view={mode}
                            today={limaToday()}
                          />
                          {comparisonColumns.map((c) => {
                            const v = totalDetailSummary(
                              focusDays.map((day) => value(day, c)),
                            );
                            return (
                              <span
                                key={c.key}
                                data-source={
                                  c.key === "base" ||
                                  c.key === "spend" ||
                                  (c.key === "fixedCost" && c.sum)
                                    ? "automatic"
                                    : "manual"
                                }
                              >
                                {c.name} ({c.label})
                                <strong>
                                  {format(v)}
                                  {monetary(c) && v.value !== null
                                    ? ` ${block.currency}`
                                    : ""}
                                </strong>
                                <small>
                                  {v.known}/{v.expected} días con dato
                                </small>
                              </span>
                            );
                          })}
                        </div>
                      </DetailSection>
                    ),
                    performance: (
                      <DetailSection
                        id={sectionId + "performance"}
                        stateKey="performance"
                        title="Desempeño de esta hoja y país"
                        tone="sales"
                      >
                        <div className="advisor-detail-summary totals-performance-summary">
                          <SummaryPeriodNotice
                            days={days}
                            view={mode}
                            today={limaToday()}
                          />
                          {ratios.map((r) => {
                            const comparison = periodComparison(
                              focusDays.map((day) => ({
                                numerator: value(day, ratioColumn(r.numerator))
                                  .value,
                                denominator: value(
                                  day,
                                  ratioColumn(r.denominator),
                                ).value,
                              })),
                              r.percent ? 100 : 1,
                            );
                            const result = comparison.value;
                            return (
                              <span
                                key={r.name}
                                data-metric={r.name}
                                data-source={
                                  r.name.includes("Meta")
                                    ? "automatic"
                                    : "manual"
                                }
                              >
                                {r.name}
                                <strong>
                                  {result === null
                                    ? "—"
                                    : result.toLocaleString("es-PE", {
                                        maximumFractionDigits: 2,
                                      }) +
                                      (r.percent
                                        ? " %"
                                        : " " + (block.currency || ""))}
                                  {result !== null &&
                                  (r.numerator.partial || r.denominator.partial)
                                    ? " *"
                                    : ""}
                                </strong>
                                <small>
                                  {comparison.mismatched
                                    ? "Faltan datos de las mismas fechas para comparar el período."
                                    : r.percent
                                      ? "Ventas y base de las mismas fechas del período"
                                      : "Inversión por resultado; no representa utilidad"}
                                </small>
                              </span>
                            );
                          })}
                        </div>
                        <p className="hint">
                          Indicadores calculados solo con los parámetros de esta
                          vista. No se reemplaza una fuente por otra si falta un
                          dato. V cuenta ventas; sin un importe de ingresos no
                          se calcula ganancia monetaria. Indicadores del día o
                          período seleccionado; * cobertura parcial.
                        </p>
                      </DetailSection>
                    ),
                    chart: (
                      <DetailSection
                        id={sectionId + "chart"}
                        stateKey="chart"
                        title="Evolución de parámetros"
                        tone="parameters"
                      >
                        <div className="row advisor-detail-controls">
                          <label>
                            1 · Barras
                            <select
                              aria-label="Barras del detalle de Totales"
                              value={barColumn.key}
                              onChange={(e) => setBars(e.target.value)}
                            >
                              {comparisonColumns.map((c) => (
                                <option key={c.key} value={c.key}>
                                  {c.name} ({c.label})
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            2 · Línea
                            <select
                              aria-label="Línea del detalle de Totales"
                              value={lineColumn.key}
                              onChange={(e) => setLine(e.target.value)}
                            >
                              {comparisonColumns.map((c) => (
                                <option key={c.key} value={c.key}>
                                  {c.name} ({c.label})
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                        {(monetary(barColumn) || monetary(lineColumn)) &&
                        !block.currency ? (
                          <p>
                            El bloque no tiene moneda; consulta los importes en
                            la tabla diaria.
                          </p>
                        ) : (
                          <MetaDailyChart
                            rows={days.map((day) => ({
                              day,
                              results: chartValue(day, barColumn),
                              cost: chartValue(day, lineColumn),
                              spend: null,
                            }))}
                            bars="results"
                            line="cost"
                            currency={block.currency || "PEN"}
                            metricName={barColumn.name}
                            since={days[0]}
                            until={days.at(-1)}
                            labels={{
                              results: barColumn.name,
                              cost: lineColumn.name,
                            }}
                            units={{
                              results: monetary(barColumn)
                                ? "currency"
                                : "count",
                              cost: monetary(lineColumn) ? "currency" : "count",
                            }}
                          />
                        )}
                      </DetailSection>
                    ),
                    days: (
                      <DetailSection
                        id={sectionId + "days"}
                        stateKey="days"
                        title={`Histórico por día · ${block.table.name} · ${block.country || "Sin país"} · ${block.currency || "Sin moneda"}`}
                        tone="daily"
                      >
                        {navigation}
                        <div className="table-scroll">
                          <table>
                            <thead>
                              <tr>
                                <th>Fecha</th>
                                {comparisonColumns.map((c) => (
                                  <th key={c.key}>
                                    {c.name} ({c.label})
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {visibleDays.map((day) => (
                                <tr key={day}>
                                  <th>
                                    <button
                                      type="button"
                                      aria-pressed={selectedDay === day}
                                      onClick={() => setSelectedDay(day)}
                                      title="Consultar asesores y productos de este día"
                                    >
                                      {day}
                                    </button>
                                  </th>
                                  {comparisonColumns.map((c) => (
                                    <td key={c.key}>{format(value(day, c))}</td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </DetailSection>
                    ),
                    products: (
                      <TotalsPeriodProducts
                        view={mode}
                        tableId={block.table.tableId}
                        country={block.country}
                        currency={block.currency}
                        days={days}
                        sectionId={sectionId}
                      />
                    ),
                  };
                  return (
                    <TotalsDailyBreakdown
                      view={mode}
                      tableId={block.table.tableId}
                      country={block.country}
                      currency={block.currency}
                      day={selectedDay}
                      sectionId={sectionId}
                    >
                      {(daily) => (
                        <>
                          <p className="inventory-detail-order-hint">
                            Arrastra ⠿ para cambiar el orden de las secciones.
                          </p>
                          {layout.custom && (
                            <button type="button" onClick={layout.reset}>
                              Restablecer orden
                            </button>
                          )}
                          {layout.warning && (
                            <p role="status">{layout.warning}</p>
                          )}
                          <div className="inventory-detail-modules">
                            {layout.order
                              .filter(
                                (key) => key !== "advisors" || !!selectedDay,
                              )
                              .map((key) => (
                                <InventoryDetailSlot key={key} id={key}>
                                  {key === "advisors"
                                    ? daily.advisors
                                    : key === "products" && selectedDay
                                      ? daily.products
                                      : sections[key]}
                                </InventoryDetailSlot>
                              ))}
                          </div>
                        </>
                      )}
                    </TotalsDailyBreakdown>
                  );
                })()}
              </>
            )}
          </dialog>
        )}
      </VerticalDetailLayout>
    </DetailSections>
  );
}
