"use client";
import { useId, useRef, useState } from "react";
import {
  deliveryFilters,
  parseDeliveryFilters,
  encodeDeliveryFilters,
  toggleDeliveryFilter,
} from "../../lib/meta-ads/state-filter";
export function MetaDeliveryFilter({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const id = useId(),
    popover = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const selected = parseDeliveryFilters(value) ?? [];
  const text = selected.length
    ? deliveryFilters
        .filter((f) => selected.includes(f.id))
        .map((f) => f.label)
        .join(" · ")
    : "Todos";
  return (
    <div className="meta-delivery-filter">
      <span id={id + "-label"}>Estado / entrega</span>
      <button
        type="button"
        className="meta-delivery-trigger"
        popoverTarget={id}
        aria-labelledby={id + "-label " + id + "-value"}
        title={text}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setPosition({
            left: Math.max(8, Math.min(r.left, innerWidth - 256)),
            top: Math.max(8, Math.min(r.bottom + 5, innerHeight - 255)),
          });
        }}
      >
        <span id={id + "-value"}>{text}</span>
        <span aria-hidden="true">⌄</span>
      </button>
      <div
        id={id}
        ref={popover}
        popover="auto"
        className="meta-delivery-popover"
        style={{ top: position.top, left: position.left }}
      >
        <fieldset>
          <legend className="sr-only">Seleccionar estados y entrega</legend>
          <label>
            <input
              type="checkbox"
              checked={!selected.length}
              onChange={() => onChange("all")}
            />
            Todos
          </label>
          {deliveryFilters.map((f) => (
            <label key={f.id}>
              <input
                type="checkbox"
                checked={selected.includes(f.id)}
                onChange={() =>
                  onChange(
                    encodeDeliveryFilters(toggleDeliveryFilter(selected, f.id)),
                  )
                }
              />
              {f.label}
            </label>
          ))}
        </fieldset>
        <small>
          Se cumplen todos los criterios. Activados y Desactivados se sustituyen
          entre sí. Con entrega considera actividad de hoy.
        </small>
      </div>
    </div>
  );
}
