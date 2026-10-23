"use client";
import { useState } from "react";
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
}: {
  rows: DailyChartRow[];
  bars: DailyChartMetric;
  line: DailyChartMetric;
  currency: string;
  metricName: string;
  since?: string;
  until?: string;
}) {
  const [active, setActive] = useState<string | null>(null);
  const layout = dailyChartLayout(rows, bars, line, since, until);
  const name = (key: DailyChartMetric) =>
    key === "cost"
      ? "Costo por resultado"
      : key === "spend"
        ? "Gasto"
        : metricName;
  const format = (value: number | null, key: DailyChartMetric) =>
    value === null
      ? "Sin dato"
      : new Intl.NumberFormat(
          "es-PE",
          key === "results"
            ? { maximumFractionDigits: 2 }
            : { style: "currency", currency, maximumFractionDigits: 2 },
        ).format(value);
  const date = (value: string) =>
    new Date(value + "T12:00:00Z").toLocaleDateString("es-PE", {
      timeZone: "UTC",
    });
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
                aria-label={`${date(p.row.day)}. 1 ${name(bars)}: ${format(p.bar, bars)}. 2 ${name(line)}: ${format(p.dot, line)}.`}
                onFocus={() => setActive(p.row.day)}
                onMouseEnter={() => setActive(p.row.day)}
              >
                <title>{`${date(p.row.day)} · 1 ${name(bars)}: ${format(p.bar, bars)} · 2 ${name(line)}: ${format(p.dot, line)}`}</title>
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
          ? `${date(selected.row.day)} · 1 ${name(bars)}: ${format(selected.bar, bars)} · 2 ${name(line)}: ${format(selected.dot, line)}`
          : "Pasa el cursor o selecciona un día para ver ambas variables."}
      </div>
    </div>
  );
}
