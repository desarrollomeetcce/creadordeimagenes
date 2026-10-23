"use client";
const periods = [
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
  return (
    <div
      className="meta-order-horizontal"
      role="group"
      aria-label="Ordenar por costo"
    >
      <span>Ordenar por costo</span>
      <div>
        {[...periods, ["custom", "Por fecha"]].map(([id, label]) => (
          <button
            type="button"
            key={id}
            aria-pressed={value === id}
            className={value === id ? "primary" : ""}
            disabled={id === "custom" && !calendar}
            title={
              id === "custom" && !calendar
                ? "Elige un rango en Periodo de análisis"
                : undefined
            }
            onClick={() => onChange(id)}
          >
            {label}
            <span aria-hidden="true">
              {value === id ? (direction === "asc" ? " ↑" : " ↓") : " ↕"}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
