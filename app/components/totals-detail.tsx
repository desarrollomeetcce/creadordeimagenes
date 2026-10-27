"use client";
import { useEffect, useId, useRef, useState } from "react";
import { performanceRatio } from "../../lib/meta-ads/performance-metrics";
import { periodTableUrl } from "../../lib/meta-ads/period-table-link";
import { useReportDayPages } from "./report-day-pages";
import { DetailSection, DetailSections } from "./detail-section";
import { DetailNavigation } from "./detail-navigation";
import { MetaDailyChart } from "./meta-daily-chart";
import { SheetSearchSelect } from "./sheet-search-select";
import {
  manualTotalColumns,
  automaticTotalColumns,
  totalDetailSummary,
  totalDetailValue,
  type TotalSheet,
  type TotalColumn,
} from "../../lib/meta-ads/totals-detail";
import type { totalSourceBlocks } from "../../lib/meta-ads/total-source-blocks";
import type { TotalValue } from "../../lib/meta-ads/effectiveness-total-values";
type Block = ReturnType<typeof totalSourceBlocks<TotalSheet>>[number];
const format = (v: TotalValue) =>
  v.pending
    ? "Sin tasa"
    : v.value === null
      ? v.na
        ? "N.A."
        : "—"
      : v.value.toLocaleString("es-PE", { maximumFractionDigits: 2 }) +
        (v.partial ? " *" : "");
export function TotalsDetail({
  blocks,
  days,
  initialMode,
  loading,
  message,
  onClose,
}: {
  blocks: Block[];
  days: string[];
  initialMode: "manual" | "automatic";
  loading: boolean;
  message: string;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const sectionId = useId();
  const [mode, setMode] = useState(initialMode),
    [blockKey, setBlockKey] = useState(blocks[0]?.key ?? ""),
    [bars, setBars] = useState("sales"),
    [line, setLine] = useState(initialMode === "manual" ? "budget" : "base");
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const { visibleDays, navigation } = useReportDayPages(days);
  const block = blocks.find((b) => b.key === blockKey) ?? blocks[0];
  const columns =
    mode === "manual" ? manualTotalColumns : automaticTotalColumns;
  const comparisonColumns =
    mode === "manual"
      ? [
          ...manualTotalColumns,
          ...automaticTotalColumns.filter(
            (c) => c.key === "base" || c.key === "spend",
          ),
        ]
      : [
          ...automaticTotalColumns,
          ...manualTotalColumns.filter(
            (c) =>
              c.key === "budget" ||
              c.key === "baseManual" ||
              c.key === "totalSpend",
          ),
        ];
  const barColumn = comparisonColumns.find((c) => c.key === bars) ?? columns[0],
    lineColumn = comparisonColumns.find((c) => c.key === line) ?? columns[1];
  const group = block?.table.groups.find(
    (g) => g.country === block.country && g.currency === block.currency,
  );
  const value = (day: string, column: TotalColumn) =>
    totalDetailValue(group?.days[day], column);
  const monetary = (column: TotalColumn) =>
    !["sales", "base", "baseManual"].includes(column.key);
  const summarize = (column: TotalColumn) =>
    totalDetailSummary(days.map((day) => value(day, column)));
  const sold = summarize(manualTotalColumns[0]),
    bm = summarize(manualTotalColumns[2]),
    gm = summarize(manualTotalColumns[3]),
    base = summarize(automaticTotalColumns[1]),
    spend = summarize(automaticTotalColumns[2]);
  const ratios = [
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
  ];
  const chartValue = (day: string, column: TotalColumn) =>
    value(day, column).value;
  return (
    <DetailSections>
      <dialog
        ref={dialog}
        className="meta-detail totals-detail"
        aria-label="Detalle de Totales"
        onCancel={onClose}
      >
        <header className="row">
          <h2>Detalle de Totales</h2>
        </header>
        <DetailNavigation
          onClose={onClose}
          items={[
            { target: sectionId + "summary", label: "Resumen", tone: "sales" },
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
          ]}
          disabled={!block}
        />
        <div className="row advisor-detail-controls">
          <button
            type="button"
            aria-pressed={mode === "manual"}
            onClick={() => setMode("manual")}
          >
            Total manual
          </button>
          <button
            type="button"
            aria-pressed={mode === "automatic"}
            onClick={() => setMode("automatic")}
          >
            Total automático
          </button>
          <SheetSearchSelect
            label="Hoja, país y moneda del detalle de Totales"
            value={block?.key ?? ""}
            options={blocks.map((b) => ({
              value: b.key,
              label: `${b.table.name} · ${b.country || "Sin país"} · ${b.currency || "Sin moneda"}`,
            }))}
            onSelect={setBlockKey}
          />
          <span>
            {days[0]} — {days.at(-1)}
          </span>
        </div>
        <p className="hint">
          Detalle del período y filtros de la pestaña. Cada hoja, país y moneda
          se consulta por separado. V es la misma suma en ambas vistas.{" "}
          {mode === "manual"
            ? "P suma el presupuesto digitado en las hojas; BM es el reparto manual por asesor y país, compartido con Asesores. GM y CF son manuales."
            : "B y G proceden de la vista automática; CF suma los costos fijos de la hoja."}{" "}
          — sin dato; N.A. no suma; * cobertura parcial.
        </p>
        {message && <p role="alert">{message}</p>}
        {loading && <small role="status">Actualizando detalle…</small>}
        {!block ? (
          <p>Selecciona una hoja de origen en Totales para ver su detalle.</p>
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
            <DetailSection
              id={sectionId + "summary"}
              stateKey="summary"
              title="Resumen"
              tone="sales"
            >
              <div className="advisor-detail-summary">
                {columns.map((c) => {
                  const v = totalDetailSummary(
                    days.map((day) => value(day, c)),
                  );
                  return (
                    <span key={c.key}>
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
            <DetailSection
              id={sectionId + "performance"}
              stateKey="performance"
              title="Desempeño de esta hoja y país"
              tone="sales"
            >
              <div className="advisor-detail-summary totals-performance-summary">
                {ratios.map((r) => {
                  const result = performanceRatio(
                    r.numerator.value,
                    r.denominator.value,
                    r.percent ? 100 : 1,
                  );
                  return (
                    <span
                      key={r.name}
                      data-metric={r.name}
                      data-source={
                        r.name.includes("Meta") ? "automatic" : "manual"
                      }
                    >
                      {r.name}
                      <strong>
                        {result === null
                          ? "—"
                          : result.toLocaleString("es-PE", {
                              maximumFractionDigits: 2,
                            }) +
                            (r.percent ? " %" : " " + (block.currency || ""))}
                        {result !== null &&
                        (r.numerator.partial || r.denominator.partial)
                          ? " *"
                          : ""}
                      </strong>
                      <small>
                        {r.percent
                          ? "Ventas registradas respecto a datos recibidos"
                          : "Inversión por resultado; no representa utilidad"}
                      </small>
                    </span>
                  );
                })}
              </div>
              <p className="hint">
                Manual: BM y GM digitadas. Meta: B y G de la vista automática.
                No se reemplaza una fuente por la otra cuando falta un dato. V
                cuenta ventas; sin un importe de ingresos no se calcula ganancia
                monetaria. Indicadores del período completo; * cobertura
                parcial.
              </p>
            </DetailSection>
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
                  El bloque no tiene moneda; consulta los importes en la tabla
                  diaria.
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
                  labels={{ results: barColumn.name, cost: lineColumn.name }}
                  units={{
                    results: monetary(barColumn) ? "currency" : "count",
                    cost: monetary(lineColumn) ? "currency" : "count",
                  }}
                />
              )}
            </DetailSection>
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
                      <th>Ventas / BM</th>
                      <th>Ventas / B Meta</th>
                      <th>Costo por venta · GM</th>
                      <th>Costo por venta · G Meta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleDays.map((day) => (
                      <tr key={day}>
                        <th>{day}</th>
                        {comparisonColumns.map((c) => (
                          <td key={c.key}>{format(value(day, c))}</td>
                        ))}
                        {[
                          {
                            n: manualTotalColumns[0],
                            d: manualTotalColumns[2],
                            percent: true,
                          },
                          {
                            n: manualTotalColumns[0],
                            d: automaticTotalColumns[1],
                            percent: true,
                          },
                          {
                            n: manualTotalColumns[3],
                            d: manualTotalColumns[0],
                            percent: false,
                          },
                          {
                            n: automaticTotalColumns[2],
                            d: manualTotalColumns[0],
                            percent: false,
                          },
                        ].map((r, i) => {
                          const n = value(day, r.n),
                            d = value(day, r.d),
                            v = performanceRatio(
                              n.value,
                              d.value,
                              r.percent ? 100 : 1,
                            );
                          return (
                            <td key={"ratio" + i}>
                              {v === null
                                ? "—"
                                : v.toLocaleString("es-PE", {
                                    maximumFractionDigits: 2,
                                  }) +
                                  (r.percent ? " %" : " " + block.currency) +
                                  (n.partial || d.partial ? " *" : "")}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </DetailSection>
          </>
        )}
      </dialog>
    </DetailSections>
  );
}
