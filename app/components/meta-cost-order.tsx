"use client";
import { useEffect, useRef, useState } from "react";
const standardPeriods = [
  ["today", "Hoy"],
  ["7", "7 días"],
  ["15", "15 días"],
  ["30", "30 días"],
  ["lifetime", "Desde el inicio"],
];
export function MetaCostOrder({
  value,
  calendar = false,
  direction,
  onChange,
}: {
  value: string;
  calendar?: boolean;
  direction: string;
  onChange: (value: string) => void;
}) {
  const periods = calendar
    ? [...standardPeriods, ["custom", "Calendario"]]
    : standardPeriods;
  const ref = useRef<HTMLDetailsElement>(null),
    [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        ref.current.open = false;
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  return (
    <details
      className="meta-order-menu"
      ref={ref}
      onToggle={(e) => setOpen(e.currentTarget.open)}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.currentTarget.open = false;
          e.currentTarget.querySelector("summary")?.focus();
        }
      }}
    >
      <summary
        aria-label={`Ordenar por costo: ${periods.find((p) => p[0] === value)?.[1] ?? "Hoy"}, ${direction === "asc" ? "menor primero" : "mayor primero"}`}
      >
        Ordenar por costo{" "}
        <strong>
          {periods.find((p) => p[0] === value)?.[1] ?? "Hoy"}{" "}
          {direction === "asc" ? "↑" : "↓"}
        </strong>
      </summary>
      <div className="stack" aria-label="Periodo para ordenar por costo">
        {periods.map(([id, label]) => (
          <button
            type="button"
            key={id}
            aria-pressed={value === id}
            className={value === id ? "primary" : ""}
            onClick={() => {
              onChange(id);
              if (ref.current) {
                ref.current.open = false;
                ref.current.querySelector("summary")?.focus();
              }
            }}
          >
            {label}
            <span aria-hidden="true">
              {value === id ? (direction === "asc" ? " ↑" : " ↓") : " ↕"}
            </span>
          </button>
        ))}
        <small>Otro clic en el mismo periodo invierte el orden.</small>
      </div>
    </details>
  );
}
