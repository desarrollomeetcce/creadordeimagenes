"use client";
import { useId, useRef, useState } from "react";
import {
  cacSeverityOrder,
  cacStatusNames,
  type CacStatus,
} from "../../lib/meta-ads/inventory-cac-policy";
import { MetaCostButton } from "./meta-cost-order";
export function MetaEvaluationOrder({
  sort,
  direction,
  status,
  onStatus,
  onOrder,
  onCac,
}: {
  sort: string;
  direction: string;
  status: string;
  onStatus: (value: string) => void;
  onOrder: (value: string) => void;
  onCac: () => void;
}) {
  const id = useId(),
    menu = useRef<HTMLDivElement>(null),
    [open, setOpen] = useState(false);
  const label = status
    ? `Estado: ${cacStatusNames[status as CacStatus]}`
    : "Estado";
  return (
    <div
      className="meta-evaluation-order"
      role="group"
      aria-label="Ordenar evaluación"
    >
      <MetaCostButton
        id="cac"
        label="CAC"
        value={sort}
        direction={direction}
        calendar
        onChange={onCac}
      />
      <button
        type="button"
        data-cost-period="evaluation"
        className={
          "meta-cost-column-button" +
          (sort === "evaluation" || status ? " primary" : "")
        }
        aria-expanded={open}
        aria-controls={id}
        aria-haspopup="dialog"
        title={label}
        onClick={(e) => {
          const n = menu.current;
          if (!n) return;
          const r = e.currentTarget.getBoundingClientRect();
          n.style.left = `${Math.max(8, Math.min(r.right - 270, window.innerWidth - 278))}px`;
          n.style.top = `${Math.max(8, Math.min(r.bottom + 6, window.innerHeight - 270))}px`;
          n.togglePopover();
        }}
      >
        <span>{label}</span>
        <span aria-hidden="true">
          {sort === "evaluation" ? (direction === "asc" ? " ↑" : " ↓") : " ↕"}
        </span>
      </button>
      <div
        ref={menu}
        id={id}
        popover="auto"
        className="meta-evaluation-menu"
        role="dialog"
        aria-label="Filtrar y ordenar por estado"
        onToggle={(e) => setOpen(e.newState === "open")}
      >
        <label>
          Mostrar estado
          <select
            aria-label="Mostrar estado de evaluación"
            value={status}
            onChange={(e) => onStatus(e.target.value)}
          >
            <option value="">Todos los estados</option>
            {[...cacSeverityOrder]
              .reverse()
              .concat("PENDING")
              .map((key) => (
                <option key={key} value={key}>
                  {cacStatusNames[key]}
                </option>
              ))}
          </select>
        </label>
        <span>Ordenar por criticidad</span>
        <button
          type="button"
          aria-pressed={sort === "evaluation" && direction === "desc"}
          onClick={() => {
            onOrder("desc");
            menu.current?.hidePopover();
          }}
        >
          Crítico → Normal
        </button>
        <button
          type="button"
          aria-pressed={sort === "evaluation" && direction === "asc"}
          onClick={() => {
            onOrder("asc");
            menu.current?.hidePopover();
          }}
        >
          Normal → Crítico
        </button>
        <small>
          Crítico · Grave · Revisar · Sin ventas · Normal. Datos pendientes al
          final.
        </small>
      </div>
    </div>
  );
}
