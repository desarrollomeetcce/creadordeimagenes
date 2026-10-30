"use client";
import { useId, useRef, useState } from "react";
export const inventoryParameters = [
  { key: "inventory", label: "Inventario" },
  { key: "primary", label: "Categoría principal" },
  { key: "secondary", label: "Categorías secundarias" },
  { key: "sheets", label: "Hojas" },
  { key: "group", label: "Grupo" },
  { key: "countries", label: "Hojas y evaluación" },
  { key: "syllabi", label: "Temarios" },
];
export function InventoryColumnVisibility({
  values,
  onChange,
  hiddenColumns = [],
  onRestoreColumn,
  onRestoreAll,
}: {
  values: string[];
  onChange: (v: string[]) => void;
  hiddenColumns?: { key: string; label: string }[];
  onRestoreColumn?: (key: string) => void;
  onRestoreAll?: () => void;
}) {
  const id = useId(),
    popover = useRef<HTMLDivElement>(null),
    [position, setPosition] = useState({ left: 8, top: 8 });
  return (
    <>
      <button
        type="button"
        popoverTarget={id}
        aria-label="Ver parámetros del inventario"
        title="Elegir columnas visibles"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setPosition({
            left: Math.max(8, Math.min(r.left, innerWidth - 288)),
            top: Math.max(8, Math.min(r.bottom + 4, innerHeight - 300)),
          });
        }}
      >
        ▤ Ver parámetros{" "}
        <small>
          {values.length}/{inventoryParameters.length}
        </small>
      </button>
      <div
        id={id}
        ref={popover}
        popover="auto"
        className="inventory-parameter-popover"
        style={{
          ...position,
          maxHeight: `calc(100dvh - ${position.top + 8}px)`,
        }}
      >
        <strong>Columnas visibles</strong>
        <label>
          <input
            type="checkbox"
            aria-label="Mostrar todos los parámetros"
            checked={values.length === inventoryParameters.length}
            onChange={(e) =>
              onChange(
                e.target.checked ? inventoryParameters.map((p) => p.key) : [],
              )
            }
          />
          Todos
        </label>
        {inventoryParameters.map((p) => (
          <label key={p.key}>
            <input
              type="checkbox"
              aria-label={"Mostrar " + p.label}
              checked={values.includes(p.key)}
              onChange={(e) =>
                onChange(
                  e.target.checked
                    ? [...values, p.key]
                    : values.filter((v) => v !== p.key),
                )
              }
            />
            {p.label}
          </label>
        ))}
        {!!hiddenColumns.length && (
          <>
            <strong>Columnas ocultas de hojas</strong>
            {hiddenColumns.map((column) => (
              <label key={column.key}>
                <input
                  type="checkbox"
                  checked={false}
                  aria-label={`Restaurar columna ${column.label}`}
                  onChange={() => onRestoreColumn?.(column.key)}
                />
                {column.label}
              </label>
            ))}
          </>
        )}
        {onRestoreAll && (
          <button type="button" onClick={onRestoreAll}>
            Restaurar todas las columnas
          </button>
        )}
        <button type="button" onClick={() => popover.current?.hidePopover()}>
          Listo
        </button>
      </div>
    </>
  );
}
