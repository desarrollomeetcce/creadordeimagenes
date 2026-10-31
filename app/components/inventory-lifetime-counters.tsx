"use client";
import type { InventoryReportSummary } from "../../lib/meta-ads/inventory-report-summary";
export function InventoryLifetimeCounters({
  summary: s,
  mode = "manual",
}: {
  summary: InventoryReportSummary;
  mode?: "manual" | "meta";
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
  const meta = mode === "meta",
    assessment = meta ? s.metaAssessment : s.budgetAssessment;
  const states: Record<string, string> = {
    PENDING: "Datos pendientes",
    CRITICAL: "Crítico",
    ALERT: "Revisar",
    TESTING: "En evaluación",
    WITHIN: "Dentro del límite",
  };
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
      label: "Días registrados",
      value: number(s.activeDays),
      partial: s.timePartial,
      hint:
        s.activeHours === null
          ? "Sin tiempo de activación registrado."
          : number(s.activeHours) +
            " horas registradas. Cada día se cuenta una sola vez.",
    },
    {
      key: "amount",
      label: meta ? "Gasto Meta (G)" : "Presupuesto (P)",
      value: money(meta ? s.metaSpend : s.budget),
      partial: meta ? s.metaPartial : s.budgetPartial,
      hint: "Importe de los días activos registrados.",
    },
    {
      key: "cac",
      label: meta ? "CAC · G/V" : "CAC · P/V",
      value: money(meta ? s.metaCac : s.budgetCac),
      partial: s.salesPartial || (meta ? s.metaPartial : s.budgetPartial),
      hint: "Costo por venta registrada. No se divide entre cero.",
    },
    {
      key: "factor",
      label: meta ? "Factor Meta" : "Factor presupuesto",
      value:
        assessment.usage === null ? "—" : number(assessment.usage * 100) + "%",
      partial: assessment.status === "PENDING",
      hint: "Importe frente al límite por ventas del Inventario (PEN).",
    },
    {
      key: "status",
      label: "Evaluación",
      value: states[assessment.status],
      partial: false,
      hint: "La evaluación financiera no cambia la activación del diplomado.",
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
          {s.since
            ? `Desde ${s.since.split("-").reverse().join("/")} · hasta`
            : "Inicio sin registrar · hasta"}{" "}
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
        {s.inferred
          ? "Histórico: días con registro manual. Activaciones y desactivaciones registradas respetadas. "
          : "Según activaciones registradas. "}
        {partial ? "* Datos parciales · — sin dato." : ""}
      </small>
    </section>
  );
}
