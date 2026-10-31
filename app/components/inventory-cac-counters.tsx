"use client";
import type { InventoryCacSummary } from "../../lib/meta-ads/inventory-cac";
import { InventoryCacStatus } from "./inventory-cac-status";
export function InventoryCacCounters({
  summary: s,
  mode,
}: {
  summary: InventoryCacSummary;
  mode: "manual" | "meta";
}) {
  const source = mode === "meta" ? s.meta : s.budget;
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
          <span>{mode === "meta" ? "Gasto Meta (G)" : "Presupuesto (P)"}</span>
          <strong>
            {money(source.amount)}
            {source.partial && source.amount !== null ? " *" : ""}
          </strong>
        </div>
        <div className="inventory-lifetime-counter">
          <span>{mode === "meta" ? "CAC · G/V" : "CAC · P/V"}</span>
          <strong>
            {money(source.cac)}
            {source.partial && source.cac !== null ? " *" : ""}
          </strong>
          {s.sales === 0 && <small>Sin ventas</small>}
        </div>
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
