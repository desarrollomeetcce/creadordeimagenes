"use client";
import type { InventoryCacSummary } from "../../lib/meta-ads/inventory-cac";
import { InventoryCacStatus } from "./inventory-cac-status";
export function InventoryCacCounters({
  summary: s,
  effectiveness,
}: {
  summary: InventoryCacSummary;
  effectiveness?: { value: number | null; partial: boolean };
}) {
  const source = s.meta;
  const nf = (n: number | null) =>
    n === null
      ? "—"
      : new Intl.NumberFormat("es-PE", { maximumFractionDigits: 2 }).format(n);
  const money = (n: number | null) =>
    n === null
      ? "—"
      : s.currency
        ? new Intl.NumberFormat("es-PE", {
            style: "currency",
            currency: s.currency,
          }).format(n)
        : nf(n);
  return (
    <section
      className="inventory-lifetime-summary"
      aria-label="CAC del período seleccionado"
    >
      <header>
        <strong>Período seleccionado</strong>
        <small>
          {s.since.split("-").reverse().join("/")} —{" "}
          {s.until.split("-").reverse().join("/")}
        </small>
      </header>
      <div className="inventory-lifetime-counters inventory-cac-counters">
        <div className="inventory-lifetime-counter">
          <span>Ventas registradas</span>
          <strong>
            {nf(s.sales)}
            {s.salesPartial && s.sales !== null ? " *" : ""}
          </strong>
        </div>
        <div className="inventory-lifetime-counter">
          <span>Días con registro</span>
          <strong>{s.days}</strong>
        </div>
        <div className="inventory-lifetime-counter">
          <span>Gasto Meta (G)</span>
          <strong>
            {money(source.amount)}
            {source.partial && source.amount !== null ? " *" : ""}
          </strong>
        </div>
        <div className="inventory-lifetime-counter">
          <span>CAC Meta · G/V</span>
          <strong>
            {money(source.cac)}
            {source.partial && source.cac !== null ? " *" : ""}
          </strong>
          {s.sales === 0 && <small>Sin ventas</small>}
        </div>
        {effectiveness && (
          <div className="inventory-lifetime-counter">
            <span>Efectividad Meta · V/B × 100</span>
            <strong>
              {nf(effectiveness.value)}
              {effectiveness.value !== null ? " %" : ""}
              {effectiveness.value !== null &&
              (effectiveness.partial || s.salesPartial || source.partial)
                ? " *"
                : ""}
            </strong>
          </div>
        )}
        <div className="inventory-lifetime-counter">
          <span>Estado · CAC en soles</span>
          <strong className="inventory-cac-state">
            <InventoryCacStatus status={source.assessment.status} />
          </strong>
        </div>
      </div>
      <small className="inventory-lifetime-help">
        N/A se excluye; cero es un registro. Los importes conservan su fuente.{" "}
        {source.partial ? "* Datos parciales." : ""}
      </small>
    </section>
  );
}
