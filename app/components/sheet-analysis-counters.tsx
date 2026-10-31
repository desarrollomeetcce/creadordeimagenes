"use client";
import type { EffectivenessRow } from "../../lib/meta-ads/effectiveness";
import type { SheetAnalysis } from "../../lib/meta-ads/sheet-analysis";
export function SheetAnalysisCounters({
  rows,
  bases,
  mode,
  country,
  dates,
  sales,
}: {
  rows: EffectivenessRow[];
  bases: SheetAnalysis["bases"];
  mode: "today" | "yesterday" | "meta";
  country: string;
  dates: string[];
  sales: string;
}) {
  const chosen = rows.filter(
      (r) => country === "__all" || r.country === country,
    ),
    countries = [...new Set(chosen.map((r) => r.country))];
  const nf = (n: number | null) =>
    n === null
      ? "—"
      : new Intl.NumberFormat("es-PE", { maximumFractionDigits: 2 }).format(n);
  const monetary = [...new Set(chosen.map((r) => r.currency))].map(
    (currency) => {
      let amount: number | null = null,
        v: number | null = null,
        partial = false;
      for (const row of chosen.filter((r) => r.currency === currency))
        for (const day of dates) {
          const d = row.days[day],
            n = mode === "meta" ? d?.metaSpend : d?.budget;
          if (
            typeof n === "number" &&
            (mode === "meta" || !d?.na.includes("budget"))
          )
            amount = (amount ?? 0) + n;
          else partial = true;
          if (typeof d?.sales === "number" && !d.na.includes("sales"))
            v = (v ?? 0) + d.sales;
          else partial = true;
          if (
            d?.partialMetrics.includes("sales") ||
            d?.partialMetrics.includes(mode === "meta" ? "spend" : "budget")
          )
            partial = true;
        }
      const money = (n: number | null) =>
        n === null
          ? "—"
          : (currency ? new Intl.NumberFormat("es-PE", {
              style: "currency",
              currency,
            }).format(n) : nf(n)) + (partial ? " *" : "");
      return {
        currency,
        amount: money(amount),
        cac: money(amount !== null && v !== null && v > 0 ? amount / v : null),
      };
    },
  );
  let base: number | null = null,
    basePartial = false,
    salesPartial = false,
    pairedSales: number | null = null;
  if (mode === "meta")
    for (const row of chosen)
      for (const day of dates) {
        const d = row.days[day];
        if (typeof d?.sourceBase === "number")
          base = (base ?? 0) + d.sourceBase;
        else basePartial = true;
        if (typeof d?.sales === "number" && !d.na.includes("sales"))
          pairedSales = (pairedSales ?? 0) + d.sales;
        else salesPartial = true;
      }
  else
    for (const c of countries)
      for (const day of dates) {
        const b = bases.find((b) => b.country === c && b.day === day),
          v = mode === "today" ? b?.bc : b?.bm;
        if (typeof v === "number") base = (base ?? 0) + v;
        else basePartial = true;
        for (const row of chosen.filter((r) => r.country === c)) {
          const d = row.days[day];
          if (typeof d?.sales === "number" && !d.na.includes("sales"))
            pairedSales = (pairedSales ?? 0) + d.sales;
          else salesPartial = true;
        }
      }
  const label =
    mode === "meta"
      ? "Base Meta (B)"
      : mode === "today"
        ? "Por contactar (BC)"
        : "Base manual (BM)";
  return (
    <div className="sheet-sales-overview sheet-analysis-overview">
      <div>
        <span>Ventas registradas</span>
        <strong>{sales}</strong>
      </div>
      <div>
        <span>{label}</span>
        <strong>
          {nf(base)}
          {base !== null && basePartial ? " *" : ""}
        </strong>
      </div>
      <div>
        <span>
          {mode === "meta"
            ? "Ventas / B"
            : mode === "today"
              ? "Ventas / BC"
              : "Ventas / BM"}
        </span>
        <strong>
          {base !== null && base > 0 && pairedSales !== null
            ? nf((pairedSales / base) * 100) +
              "%" +
              (basePartial || salesPartial ? " *" : "")
            : "—"}
        </strong>
      </div>
      <div>
        <span>{mode === "meta" ? "Gasto Meta (G)" : "Presupuesto (P)"}</span>
        <strong>
          {monetary.map((m) => (
            <small key={m.currency}>{m.amount}</small>
          ))}
        </strong>
      </div>
      <div>
        <span>{mode === "meta" ? "CAC · G/V" : "CAC · P/V"}</span>
        <strong>
          {monetary.map((m) => (
            <small key={m.currency}>{m.cac}</small>
          ))}
        </strong>
      </div>
    </div>
  );
}
