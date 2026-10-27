"use client";
import { useEffect, useRef, useState } from "react";
export function AdvisorScatter({
  rows,
  xLabel,
  yLabel,
}: {
  rows: { day: string; x: number | null; y: number | null }[];
  xLabel: string;
  yLabel: string;
}) {
  const root = useRef<HTMLDivElement>(null),
    [width, setWidth] = useState(720);
  useEffect(() => {
    if (!root.current) return;
    const resize = new ResizeObserver(([e]) =>
      setWidth(Math.max(320, e.contentRect.width)),
    );
    resize.observe(root.current);
    return () => resize.disconnect();
  }, []);
  const points = rows.filter(
      (r): r is { day: string; x: number; y: number } =>
        r.x !== null &&
        r.y !== null &&
        Number.isFinite(r.x) &&
        Number.isFinite(r.y),
    ),
    maxX = Math.max(1, ...points.map((p) => p.x)),
    maxY = Math.max(1, ...points.map((p) => p.y)),
    left = 60,
    right = width - 20,
    top = 20,
    bottom = 230;
  return (
    <div ref={root} className="advisor-scatter">
      <svg
        viewBox={`0 0 ${width} 290`}
        role="img"
        aria-label={`${yLabel} frente a ${xLabel}, un punto por fecha con ambos datos`}
      >
        <line
          x1={left}
          x2={right}
          y1={bottom}
          y2={bottom}
          stroke="currentColor"
        />
        <line x1={left} x2={left} y1={top} y2={bottom} stroke="currentColor" />
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <g key={t}>
            <line
              x1={left}
              x2={right}
              y1={bottom - t * (bottom - top)}
              y2={bottom - t * (bottom - top)}
              stroke="currentColor"
              opacity=".15"
            />
            <text
              x={left - 8}
              y={bottom - t * (bottom - top) + 4}
              textAnchor="end"
            >
              {(t * maxY).toLocaleString("es-PE", { maximumFractionDigits: 2 })}
            </text>
            <text
              x={left + t * (right - left)}
              y={bottom + 18}
              textAnchor="middle"
            >
              {(t * maxX).toLocaleString("es-PE", { maximumFractionDigits: 2 })}
            </text>
          </g>
        ))}
        {points.map((p) => (
          <circle
            key={p.day}
            cx={left + (p.x / maxX) * (right - left)}
            cy={bottom - (p.y / maxY) * (bottom - top)}
            r="5"
            tabIndex={0}
          >
            <title>
              {p.day}: {xLabel} = {p.x}; {yLabel} = {p.y}
            </title>
          </circle>
        ))}
        <text x={(left + right) / 2} y="278" textAnchor="middle">
          {xLabel}
        </text>
        <text
          transform={`translate(14 ${(top + bottom) / 2}) rotate(-90)`}
          textAnchor="middle"
        >
          {yLabel}
        </text>
        {!points.length && (
          <text x={(left + right) / 2} y="120" textAnchor="middle">
            Sin fechas con ambos datos
          </text>
        )}
      </svg>
      <small>
        {points.length} fechas con ambos parámetros. Los vacíos y N.A. se
        omiten; cero explícito se conserva.
      </small>
    </div>
  );
}
