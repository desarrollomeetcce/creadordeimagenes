"use client";
import { Fragment, type ReactNode } from "react";
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
  afterLifetime,
}: {
  value: string;
  calendar?: boolean;
  afterLifetime?: ReactNode;
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
          <Fragment key={id}>
            <MetaCostButton
              id={id}
              label={label}
              value={value}
              direction={direction}
              calendar={calendar}
              onChange={onChange}
            />
            {id === "lifetime" ? afterLifetime : null}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

export function MetaCostButton({
  id,
  label,
  value,
  direction,
  calendar,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  direction: string;
  calendar: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <button
      type="button"
      className={"meta-cost-column-button" + (value === id ? " primary" : "")}
      data-cost-period={id}
      aria-pressed={value === id}
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
  );
}
