"use client";
import { useId, useRef, useState } from "react";
import type { MetricRange } from "../../lib/meta-ads/period-summary";
export function SheetNumberFilter({
  label,
  value,
  onApply,
  money = false,
}: {
  label: string;
  value?: MetricRange;
  onApply: (v: MetricRange) => void;
  money?: boolean;
}) {
  const id = useId(),
    popover = useRef<HTMLDivElement>(null),
    [minimum, setMinimum] = useState(""),
    [maximum, setMaximum] = useState(""),
    [error, setError] = useState(""),
    [position, setPosition] = useState({ top: 8, left: 8 });
  const active = value?.min !== undefined || value?.max !== undefined;
  return (
    <>
      <button
        type="button"
        className={"sheet-filter-trigger" + (active ? " active" : "")}
        popoverTarget={id}
        aria-label={`Filtrar ${label}`}
        title={
          active
            ? `Filtro activo: ${value?.min ?? "sin mínimo"} a ${value?.max ?? "sin máximo"}`
            : `Filtrar ${label} por mínimo y máximo`
        }
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setPosition({
            left: Math.max(8, Math.min(r.left, innerWidth - 248)),
            top: Math.max(8, Math.min(r.bottom + 4, innerHeight - 220)),
          });
          setMinimum(value?.min === undefined ? "" : String(value.min));
          setMaximum(value?.max === undefined ? "" : String(value.max));
          setError("");
        }}
      >
        <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
          <path
            d="M2 3h12L9.5 8v4l-3 1V8z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
          />
        </svg>
      </button>
      <div
        id={id}
        ref={popover}
        popover="auto"
        className="sheet-number-filter"
        style={{
          ...position,
          maxHeight: `calc(100dvh - ${position.top + 8}px)`,
        }}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const min = minimum === "" ? undefined : Number(minimum),
              max = maximum === "" ? undefined : Number(maximum);
            if (
              (min !== undefined && !Number.isFinite(min)) ||
              (max !== undefined && !Number.isFinite(max)) ||
              (min !== undefined && max !== undefined && min > max)
            ) {
              setError("Revisa el mínimo y el máximo.");
              return;
            }
            onApply({ min, max });
            popover.current?.hidePopover();
          }}
        >
          <strong>{label}</strong>
          <div>
            <label>
              Mínimo
              <input
                type="number"
                min="0"
                step="any"
                aria-label={`Mínimo ${label}`}
                value={minimum}
                onChange={(e) => setMinimum(e.target.value)}
              />
            </label>
            <label>
              Máximo
              <input
                type="number"
                min="0"
                step="any"
                aria-label={`Máximo ${label}`}
                value={maximum}
                onChange={(e) => setMaximum(e.target.value)}
              />
            </label>
          </div>
          <small>
            {money
              ? "Importes en la moneda mostrada de cada fila."
              : "Cantidad del período seleccionado."}{" "}
            Los valores sin dato quedan fuera del filtro.
          </small>
          {error && <p role="alert">{error}</p>}
          <footer>
            <button
              type="button"
              onClick={() => {
                onApply({});
                popover.current?.hidePopover();
              }}
            >
              Borrar
            </button>
            <button type="submit" className="primary">
              Aplicar filtro
            </button>
          </footer>
        </form>
      </div>
    </>
  );
}
