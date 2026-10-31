"use client";
import { advisorFinancialSummary } from "../../lib/meta-ads/advisor-financial-summary";
import type { AdvisorDayData } from "./advisor-types";
const number = (n: number) =>
  new Intl.NumberFormat("es-PE", { maximumFractionDigits: 2 }).format(n);
const money = (n: number, currency: string) =>
  currency
    ? new Intl.NumberFormat("es-PE", {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
      }).format(n)
    : number(n) + " · moneda pendiente";
export function AdvisorFinancialSummary({
  days,
  meta = false,
}: {
  days: { day: string; value: AdvisorDayData }[];
  meta?: boolean;
}) {
  const summary = advisorFinancialSummary(
    days.map((d) => ({
      day: d.day,
      sales: d.value.na ? null : d.value.sales,
      financial: d.value.financial,
    })),
  );
  const value = (key: "budget" | "spend" | "budgetCac" | "metaCac") =>
    summary.money
      .map((v) =>
        v[key] === null
          ? `${v.currency || "Moneda pendiente"}: —`
          : money(v[key]!, v.currency) +
            (v.partial ||
            (!meta && v.budgetPartial) ||
            summary.assignmentPartial ||
            (meta && summary.metaPartial)
              ? " *"
              : ""),
      )
      .join(" · ") || "—";
  return (
    <>
      {meta && (
        <>
          <span>
            Base Meta Ads (B)
            <strong>
              {summary.base === null
                ? "—"
                : number(summary.base) + (summary.metaPartial ? " *" : "")}
            </strong>
            <small>Conversaciones de los informes originales de Meta.</small>
          </span>
          <span>
            Efectividad V/B
            <strong>
              {summary.effectiveness === null
                ? "—"
                : number(summary.effectiveness) +
                  " %" +
                  (summary.metaPartial ? " *" : "")}
            </strong>
            <small>Ventas / B × 100 · mismas fechas.</small>
          </span>
        </>
      )}
      <span>
        {meta ? "Gasto Meta (G)" : "Presupuesto (P)"}
        <strong>{value(meta ? "spend" : "budget")}</strong>
        <small>
          {meta
            ? "Gasto informado por Meta, sin ajustes manuales."
            : "Presupuestos asignados de las fechas elegidas."}
        </small>
      </span>
      <span>
        Costo de adquisición (CAC)
        <strong>{value(meta ? "metaCac" : "budgetCac")}</strong>
        <small>
          {meta ? "G / ventas" : "P / ventas"} · no se divide entre cero.
        </small>
      </span>
      {summary.assignmentPartial && (
        <span className="advisor-metric-context">
          Hay cambios de asesor dentro del día. No se reparte el presupuesto ni
          Meta por horas.
        </span>
      )}
    </>
  );
}
