import type { EffectivenessSheet, EffectivenessRow } from "./effectiveness";
import { sumEffectivenessDay } from "./effectiveness-total-values";
import { sheetMetrics, type SheetMetric } from "./period-summary";
import { totalDetailSummary } from "./totals-detail";
import type { TotalValue } from "./effectiveness-total-values";
export type TotalProduct = {
  aliasId: string;
  name: string;
  active: boolean;
  sums: Record<SheetMetric, TotalValue>;
  days?: Record<string, ProductReportDay>;
  advisors?: ProductAdvisor[];
};
/** Merge report pages by identity; only recorded zero is zero, absent sales stay unknown. */
export function summarizeTotalProducts(
  pages: EffectivenessSheet[],
  days: string[],
  country: string,
  currency: string,
): TotalProduct[] {
  const rows = new Map<string, EffectivenessRow>();
  const names = new Map(
    pages.flatMap((p) => p.table.aliases.map((a) => [a.id, a.name] as const)),
  );
  for (const page of pages)
    for (const row of page.rows) {
      if (row.country !== country || row.currency !== currency) continue;
      const old = rows.get(row.aliasId);
      rows.set(row.aliasId, { ...row, days: { ...old?.days, ...row.days } });
    }
  return [...rows.values()]
    .map((row) => {
      const daily = days.map((day) => sumEffectivenessDay([row], day));
      return {
        aliasId: row.aliasId,
        name: names.get(row.aliasId) ?? "Inventario",
        active: row.active,
        sums: Object.fromEntries(
          sheetMetrics.map((metric) => [
            metric.key,
            totalDetailSummary(daily.map((day) => day[metric.key])),
          ]),
        ) as Record<SheetMetric, TotalValue>,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}

export type ProductAdvisor = {
  advisorId: string | null;
  name: string;
  sales: number | null;
  na: boolean;
  partial: boolean;
};
export type ProductReportDay = {
  sums: Record<SheetMetric, TotalValue>;
  advisors: ProductAdvisor[];
};
export type TotalProductReport = {
  aliasId: string;
  name: string;
  active: boolean;
  days: Record<string, ProductReportDay>;
};
export type TotalProductPage = { products: TotalProductReport[] };
export function mergeTotalProductReports(
  pages: TotalProductPage[],
  dates: string[],
): TotalProduct[] {
  const products = new Map<string, TotalProductReport>();
  for (const page of pages)
    for (const p of page.products) {
      const old = products.get(p.aliasId);
      products.set(p.aliasId, { ...p, days: { ...old?.days, ...p.days } });
    }
  const unknown: TotalValue = {
    value: null,
    known: 0,
    expected: 1,
    na: 0,
    pending: false,
    partial: true,
  };
  return [...products.values()]
    .map((p) => {
      const people = new Map<string | null, ProductAdvisor>();
      for (const date of dates)
        for (const person of p.days[date]?.advisors ?? []) {
          const old = people.get(person.advisorId) ?? {
            ...person,
            sales: null,
            na: false,
            partial: false,
          };
          if (person.sales !== null && !person.na)
            old.sales = (old.sales ?? 0) + person.sales;
          old.na ||= person.na;
          old.partial ||=
            person.partial || (person.sales === null && !person.na);
          people.set(person.advisorId, old);
        }
      return {
        ...p,
        sums: Object.fromEntries(
          sheetMetrics.map((metric) => [
            metric.key,
            totalDetailSummary(
              dates.map((day) => p.days[day]?.sums[metric.key] ?? unknown),
            ),
          ]),
        ) as Record<SheetMetric, TotalValue>,
        advisors: [...people.values()].map((p) => ({
          ...p,
          na: p.sales === null && p.na,
        })),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}
