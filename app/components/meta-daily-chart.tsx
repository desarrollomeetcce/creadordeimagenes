"use client";
import { useMemo, useState } from "react";
import {
  dailyChartLayout,
  type DailyChartRow,
  type DailyChartMetric,
} from "../../lib/meta-ads/daily-chart";
export function MetaDailyChart({
  rows,
  bars,
  line,
  currency,
  metricName,
  since,
  until,
  labels,
  units,
}: {
  rows: DailyChartRow[];
  bars: DailyChartMetric;
  line: DailyChartMetric;
  currency: string;
  metricName: string;
  since?: string;
  until?: string;
  labels?: Partial<Record<DailyChartMetric, string>>;
  units?: Partial<Record<DailyChartMetric, "count" | "hours" | "currency">>;
}) {
  const [active, setActive] = useState<string | null>(null);
  const layout = useMemo(
    () => dailyChartLayout(rows, bars, line, since, until),
    [rows, bars, line, since, until],
  );
  const formats = useMemo(
    () => ({
      money: new Intl.NumberFormat("es-PE", {
        style: "currency",
        currency: currency || "PEN",
        maximumFractionDigits: 2,
      }),
      count: new Intl.NumberFormat("es-PE", { maximumFractionDigits: 2 }),
      sales: new Intl.NumberFormat("es-PE", { maximumFractionDigits: 0 }),
      hours: new Intl.NumberFormat("es-PE", { maximumFractionDigits: 8 }),
      date: new Intl.DateTimeFormat("es-PE", { timeZone: "UTC" }),
    }),
    [currency],
  );
  const name = (key: DailyChartMetric) =>
    labels?.[key] ??
    (key === "cost"
      ? "Costo por resultado"
      : key === "spend"
        ? "Gasto"
        : key === "sales"
          ? "Ventas por día"
          : metricName);
  const format = (value: number | null, key: DailyChartMetric) => {
    if (value === null) return "Sin dato";
    const unit =
      units?.[key] ??
      (key === "results" || key === "sales" ? "count" : "currency");
    return (
      (unit === "currency"
        ? formats.money
        : unit === "hours"
          ? formats.hours
          : key === "sales"
            ? formats.sales
            : formats.count
      ).format(value) + (unit === "hours" ? " h" : "")
    );
  };
  const pointFormat = (
    value: number | null,
    key: DailyChartMetric,
    row: DailyChartRow,
  ) =>
    format(value, key) +
    (value !== null && key === "sales" && row.salesPartial ? "*" : "");
  const date = (value: string) =>
    formats.date.format(new Date(value + "T12:00:00Z"));
  let lastLabelX = -Infinity;
  const labelledDays = new Set(
    layout.points
      .filter((p) => {
        if (p.x - lastLabelX < 26) return false;
        lastLabelX = p.x;
        return true;
      })
      .map((p) => p.row.day),
  );
  const selected = layout.points.find((p) => p.row.day === active);
  const axis = (key: DailyChartMetric, side: "left" | "right") => (
    <div
      className={`meta-chart-axis meta-chart-axis-${side}`}
      aria-label={`${side === "left" ? "Eje izquierdo" : "Eje derecho"}: ${name(key)}`}
    >
      {layout[side].ticks.map((v, i) => (
        <span
          key={i}
          style={{ top: layout.top + (i * layout.plotHeight) / 4 }}
          title={format(v, key)}
        >
          {format(v, key)}
        </span>
      ))}
    </div>
  );
  return (
    <div className="meta-dual-chart">
      <div className="meta-dual-legend">
        <span className="meta-bar-legend">
          1 ▮ {name(bars)} · eje izquierdo
        </span>
        <span className="meta-line-legend">
          2 ─●─ {name(line)} · eje derecho
        </span>
        <small>Escalas independientes</small>
      </div>
      <div className="meta-dual-axes">
        {axis(bars, "left")}
        <div className="meta-daily-scroll">
          <svg
            className="meta-daily-combo"
            viewBox={`0 0 ${layout.width} ${layout.height}`}
            preserveAspectRatio="none"
            style={{ minWidth: layout.width }}
            role="img"
            aria-label={`1 Barras: ${name(bars)}, eje izquierdo. 2 Línea con puntos: ${name(line)}, eje derecho. Fechas y cifras exactas en la tabla siguiente.`}
            onMouseLeave={() => setActive(null)}
          >
            {layout.left.ticks.map((_, i) => (
              <line
                key={i}
                className="meta-chart-gridline"
                x1={0}
                x2={layout.width}
                y1={layout.top + (i * layout.plotHeight) / 4}
                y2={layout.top + (i * layout.plotHeight) / 4}
              />
            ))}
            {layout.points.map((p) =>
              p.barHeight === null ? null : (
                <rect
                  key={p.row.day}
                  data-day={p.row.day}
                  className="meta-chart-bar"
                  x={p.x - layout.barWidth / 2}
                  y={layout.top + layout.plotHeight - p.barHeight}
                  width={layout.barWidth}
                  height={p.barHeight}
                  rx={3}
                />
              ),
            )}
            {layout.segments.map((segment, i) => (
              <polyline
                key={i}
                className="meta-chart-line"
                points={segment.map((p) => `${p.x},${p.y}`).join(" ")}
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {selected && (
              <line
                className="meta-chart-guide"
                x1={selected.x}
                x2={selected.x}
                y1={layout.top}
                y2={layout.top + layout.plotHeight}
              />
            )}
            {layout.points.map((p) => (
              <g
                key={p.row.day}
                data-day={p.row.day}
                className="meta-chart-day"
                tabIndex={0}
                aria-label={`${date(p.row.day)}. 1 ${name(bars)}: ${pointFormat(p.bar, bars, p.row)}. 2 ${name(line)}: ${pointFormat(p.dot, line, p.row)}.`}
                onFocus={() => setActive(p.row.day)}
                onMouseEnter={() => setActive(p.row.day)}
              >
                <title>{`${date(p.row.day)} · 1 ${name(bars)}: ${pointFormat(p.bar, bars, p.row)} · 2 ${name(line)}: ${pointFormat(p.dot, line, p.row)}`}</title>
                <rect
                  x={p.x - layout.barWidth / 2}
                  y={layout.top}
                  width={layout.barWidth}
                  height={layout.plotHeight}
                  fill="transparent"
                />
                {p.y !== null && (
                  <circle
                    className="meta-chart-dot"
                    cx={p.x}
                    cy={p.y}
                    r={selected?.row.day === p.row.day ? 5 : 3.5}
                    vectorEffect="non-scaling-stroke"
                  />
                )}
                <text
                  x={p.x}
                  y={layout.top + layout.plotHeight + 18}
                  textAnchor="middle"
                >
                  {labelledDays.has(p.row.day)
                    ? `${p.row.day.slice(8)}/${p.row.day.slice(5, 7)}`
                    : ""}
                </text>
              </g>
            ))}
          </svg>
        </div>
        {axis(line, "right")}
      </div>
      <div className="meta-chart-readout" role="status" aria-live="polite">
        {selected
          ? `${date(selected.row.day)} · 1 ${name(bars)}: ${pointFormat(selected.bar, bars, selected.row)} · 2 ${name(line)}: ${pointFormat(selected.dot, line, selected.row)}`
          : "Pasa el cursor o selecciona un día para ver ambas variables."}
      </div>
    </div>
  );
}
