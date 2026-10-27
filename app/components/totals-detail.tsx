"use client";
import { useEffect, useRef, useState } from "react";
import { periodTableUrl } from "../../lib/meta-ads/period-table-link";
import { useReportDayPages } from "./report-day-pages";
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
  const barColumn = columns.find((c) => c.key === bars) ?? columns[0],
    lineColumn = columns.find((c) => c.key === line) ?? columns[1];
  const group = block?.table.groups.find(
    (g) => g.country === block.country && g.currency === block.currency,
  );
  const value = (day: string, column: TotalColumn) =>
    totalDetailValue(group?.days[day], column);
  const monetary = (column: TotalColumn) =>
    !["sales", "base", "baseManual"].includes(column.key);
  const chartValue = (day: string, column: TotalColumn) =>
    value(day, column).value;
  return (
    <dialog
      ref={dialog}
      className="meta-detail totals-detail"
      aria-label="Detalle de Totales"
      onCancel={onClose}
    >
      <header className="row">
        <h2>Detalle de Totales</h2>
        <button className="ui-close-button" type="button" onClick={onClose}>
          Cerrar detalle
        </button>
      </header>
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
        Detalle del período y filtros de la pestaña. Cada hoja, país y moneda se
        consulta por separado. V es la misma suma en ambas vistas.{" "}
        {mode === "manual"
          ? "P suma los presupuestos; BM, GM y CF son los valores manuales de Totales."
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
          <div className="advisor-detail-summary">
            {columns.map((c) => {
              const v = totalDetailSummary(days.map((day) => value(day, c)));
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
          <h3 className="detail-section-title detail-section-parameters">
            Evolución de parámetros
          </h3>
          <div className="row advisor-detail-controls">
            <label>
              1 · Barras
              <select
                aria-label="Barras del detalle de Totales"
                value={barColumn.key}
                onChange={(e) => setBars(e.target.value)}
              >
                {columns.map((c) => (
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
                {columns.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.name} ({c.label})
                  </option>
                ))}
              </select>
            </label>
          </div>
          {(monetary(barColumn) || monetary(lineColumn)) && !block.currency ? (
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
          <h3 className="detail-section-title detail-section-daily">
            Histórico por día · {block.table.name} ·{" "}
            {block.country || "Sin país"} · {block.currency || "Sin moneda"}
          </h3>
          {navigation}
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  {columns.map((c) => (
                    <th key={c.key}>
                      {c.name} ({c.label})
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleDays.map((day) => (
                  <tr key={day}>
                    <th>{day}</th>
                    {columns.map((c) => (
                      <td key={c.key}>{format(value(day, c))}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </dialog>
  );
}
