"use client";
import type { InventoryLifetimeSummary } from "../../lib/meta-ads/inventory-lifetime-summary";
export function InventoryLifetimeCounters({
  summary: s,
}: {
  summary: InventoryLifetimeSummary;
}) {
  const number = (n: number | null) =>
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
            maximumFractionDigits: 2,
          }).format(n)
        : number(n);
  const cards = [
    {
      key: "sales",
      label: "Ventas acumuladas",
      value: number(s.sales),
      partial: s.salesPartial,
      hint: "Ventas registradas en todas las fechas, incluidos pagos posteriores al apagado.",
    },
    {
      key: "days",
      label: "Días activos",
      value: number(s.activeDays),
      partial: s.timePartial,
      hint:
        s.activeHours === null
          ? "Sin tiempo de activación registrado."
          : number(s.activeHours) +
            " horas registradas. Cada día se cuenta una sola vez.",
    },
    {
      key: "budget",
      label: "Presupuesto acumulado",
      value: money(s.budget),
      partial: s.budgetPartial,
      hint: "Presupuesto de todos los días con activación registrada.",
    },
    {
      key: "meta",
      label: "Gasto de Meta",
      value: money(s.metaSpend),
      partial: s.metaPartial,
      hint: "Gasto recibido de Meta en los días activos; no incluye gasto manual.",
    },
  ];
  const partial = cards.some((c) => c.partial);
  return (
    <section
      className="inventory-lifetime-summary"
      aria-label="Acumulado general del diplomado"
    >
      <header>
        <strong>Acumulado general</strong>
        <small>
          Todo el historial registrado · hasta{" "}
          {s.until.split("-").reverse().join("/")}
        </small>
      </header>
      <div className="inventory-lifetime-counters">
        {cards.map((c) => (
          <div
            className="inventory-lifetime-counter"
            data-tone={c.key}
            key={c.key}
            title={c.hint}
          >
            <span>{c.label}</span>
            <strong>
              {c.value}
              {c.partial && c.value !== "—" ? (
                <sup aria-label="Datos parciales">*</sup>
              ) : null}
            </strong>
            {c.key === "days" && s.activeHours !== null && (
              <small>{number(s.activeHours)} h registradas</small>
            )}
          </div>
        ))}
      </div>
      <small className="inventory-lifetime-help">
        No cambia con el rango del gráfico. Presupuesto y Meta: días activos.{" "}
        {partial
          ? "* Acumulado parcial: faltan datos o fechas de activación. Un guion indica que no hay datos."
          : "Cada día se cuenta una sola vez."}
      </small>
    </section>
  );
}
