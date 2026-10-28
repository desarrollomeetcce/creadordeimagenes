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
