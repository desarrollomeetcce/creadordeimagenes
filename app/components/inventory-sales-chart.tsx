"use client";
import { useState } from "react";
import {
  inventorySalesGroups,
  type InventorySalesEntry,
} from "../../lib/meta-ads/inventory-advisor-sales";
const palette = [
  "#176b59",
  "#357fc4",
  "#a15bb0",
  "#bb641c",
  "#b43e63",
  "#598129",
  "#207f8c",
  "#855530",
  "#755ce0",
  "#ad6f00",
  "#a03535",
  "#486781",
];
export function InventorySalesChart({
  entries,
  people,
  selected,
  onSelect,
}: {
  entries: InventorySalesEntry[];
  people: {
    advisorId: string | null;
    name: string;
    sales: number | null;
    knownDays: number;
  }[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  const [page, setPage] = useState(0),
    all = inventorySalesGroups(entries).filter((g) =>
      g.bars.some((b) => selected === "__all" || b.id === selected),
    ),
    pages = Math.max(1, Math.ceil(all.length / 31)),
    current = Math.min(page, pages - 1),
    end = all.length - current * 31,
    groups = all
      .slice(Math.max(0, end - 31), end)
      .map((g) => ({
        ...g,
        bars: g.bars.filter((b) => selected === "__all" || b.id === selected),
      }));
  const ids = [...people].sort((a, b) =>
      (a.advisorId ?? "").localeCompare(b.advisorId ?? ""),
    ),
    color = (id: string) => {
      const i = ids.findIndex((p) => (p.advisorId ?? "__unassigned") === id);
      return palette[i] ?? `hsl(${Math.round(i * 137.508) % 360} 58% 47%)`;
    };
  if (!groups.length) return null;
  const max = Math.max(...groups.flatMap((g) => g.bars.map((b) => b.sales))),
    step = Math.max(1, Math.ceil(max / 4)),
    ceiling = step * 4,
    barWidth = Math.min(
      70,
      Math.max(
        22,
        ...groups.flatMap((g) =>
          g.bars.map((b) => String(b.sales).length * 7 + 6),
        ),
      ),
    ),
    sizes = groups.map((g) =>
      Math.max(56, g.bars.length * (barWidth + 2) + 20),
    ),
    width = Math.max(420, sizes.reduce((a, b) => a + b, 0) + 60),
    extra = (width - 60 - sizes.reduce((a, b) => a + b, 0)) / groups.length;
  let cursor = 46;
  const positions = groups.map((g, i) => {
    const size = sizes[i] + extra,
      x = cursor + (size - g.bars.length * (barWidth + 2)) / 2;
    cursor += size;
    return { x, center: cursor - size / 2 };
  });
  return (
    <div
      className="inventory-sales-grouped"
      aria-label="Comparativo diario de ventas por asesor"
    >
      <div
        className="inventory-sales-chart-legend"
        role="group"
        aria-label="Leyenda de asesores"
      >
        {people
          .filter((p) => (p.sales ?? 0) > 0)
          .map((p) => {
            const id = p.advisorId ?? "__unassigned";
            return (
              <button
                type="button"
                key={id}
                aria-pressed={selected === id}
                title={`${p.name}: ${p.sales} ventas en el período · ${p.knownDays} día(s) con registro`}
                onClick={() => {
                  onSelect(selected === id ? "__all" : id);
                  setPage(0);
                }}
              >
                <span style={{ backgroundColor: color(id) }} />
                {p.name} <b>{p.sales}</b>
              </button>
            );
          })}
      </div>
      <div
        className="inventory-sales-chart-scroll"
        tabIndex={0}
        aria-label="Gráfico vertical, desplázate para ver las fechas"
      >
        <svg
          width={width}
          height="260"
          viewBox={`0 0 ${width} 260`}
          role="img"
          aria-label="Ventas por fecha y asesor; eje horizontal fechas, eje vertical cantidad de ventas"
        >
          <text x="6" y="13">
            Ventas
          </text>
          {Array.from({ length: 5 }, (_, i) => {
            const y = 215 - i * 45;
            return (
              <g key={i}>
                <line
                  x1="42"
                  x2={width - 10}
                  y1={y}
                  y2={y}
                  className="inventory-sales-chart-grid"
                />
                <text x="35" y={y + 4} textAnchor="end">
                  {step * i}
                </text>
              </g>
            );
          })}
          {groups.map((g, i) => (
            <g key={g.day} data-sales-chart-day={g.day}>
              {g.bars.map((b, j) => {
                const x = positions[i].x + j * (barWidth + 2),
                  h = (b.sales / ceiling) * 180,
                  y = 215 - h;
                return (
                  <g
                    key={b.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`${b.name}, ${g.day}: ${b.sales} ventas${b.partial ? " · cobertura parcial" : ""}; ver sus fechas`}
                    data-sales-chart-advisor={b.id}
                    onClick={() => onSelect(b.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSelect(b.id);
                      }
                    }}
                  >
                    <title>
                      {b.name} · {g.day}: {b.sales} ventas
                      {b.partial ? " · cobertura parcial" : ""}
                    </title>
                    <rect
                      x={x}
                      y={y}
                      width={barWidth}
                      height={h}
                      rx="2"
                      fill={color(b.id)}
                    />
                    <text x={x + barWidth / 2} y={y - 5} textAnchor="middle">
                      {b.sales}
                      {b.partial ? "*" : ""}
                    </text>
                  </g>
                );
              })}
              <text x={positions[i].center} y="236" textAnchor="middle">
                {g.day.slice(8)}/{g.day.slice(5, 7)}
              </text>
              <text
                x={positions[i].center}
                y="251"
                textAnchor="middle"
                className="inventory-sales-chart-year"
              >
                {g.day.slice(0, 4)}
              </text>
            </g>
          ))}
        </svg>
      </div>
      {pages > 1 && (
        <nav
          className="row inventory-sales-chart-pages"
          aria-label="Fechas del comparativo"
        >
          <button
            type="button"
            disabled={current === pages - 1}
            onClick={() => setPage(current + 1)}
          >
            ← Fechas anteriores
          </button>
          <span>
            {groups[0].day} — {groups.at(-1)!.day} · {current + 1}/{pages}
          </span>
          <button
            type="button"
            disabled={current === 0}
            onClick={() => setPage(current - 1)}
          >
            Fechas recientes →
          </button>
        </nav>
      )}
    </div>
  );
}
