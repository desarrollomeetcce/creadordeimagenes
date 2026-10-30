import type { ActivePeriod } from "./active-periods";
import type { EffectivenessRow } from "./effectiveness";
import { convertMoney, type FxRates } from "./exchange-rates";
/** Daily totals use each date once; duration uses the actual recorded intervals. */
export function inventoryLifetimeSummary(input: {
  since: string;
  today: string;
  asOf: string;
  currency: string;
  periods: ActivePeriod[];
  timeComplete: boolean;
  days: EffectivenessRow["days"];
  meta: { day: string; currency: string; amount: number }[];
  rates: Map<string, FxRates>;
}) {
  const metaByDay = new Map<string, typeof input.meta>();
  for (const part of input.meta) {
    const parts = metaByDay.get(part.day) ?? [];
    parts.push(part);
    metaByDay.set(part.day, parts);
  }
  const activeDays = new Set<string>();
  let activeHours = 0;
  for (const p of input.periods) {
    const end = Math.min(
        Date.parse(p.until ?? input.asOf),
        Date.parse(input.asOf),
      ),
      start = Date.parse(p.from);
    if (end <= start) continue;
    activeHours += (end - start) / 3600000;
    for (
      let at = Date.parse(p.since);
      at <= Date.parse(p.through);
      at += 86400000
    )
      activeDays.add(new Date(at).toISOString().slice(0, 10));
  }
  let sales: number | null = null,
    budget: number | null = null,
    metaSpend: number | null = null;
  let salesPartial = !input.timeComplete,
    budgetPartial = !input.timeComplete,
    metaPartial = !input.timeComplete;
  for (
    let at = Date.parse(input.since);
    at <= Date.parse(input.today);
    at += 86400000
  ) {
    const day = new Date(at).toISOString().slice(0, 10),
      d = input.days[day];
    if (typeof d?.sales === "number" && !d.na.includes("sales"))
      sales = (sales ?? 0) + d.sales;
    else salesPartial = true;
    if (d?.partialMetrics.includes("sales")) salesPartial = true;
  }
  for (const day of activeDays) {
    const d = input.days[day];
    if (typeof d?.budget === "number" && !d.na.includes("budget"))
      budget = (budget ?? 0) + d.budget;
    else budgetPartial = true;
    if (d?.partialMetrics.includes("budget") || d?.fxPending.includes("budget"))
      budgetPartial = true;
    const parts = metaByDay.get(day) ?? [];
    if (!parts.length) metaPartial = true;
    for (const p of parts) {
      const value = convertMoney(
        p.amount,
        p.currency,
        input.currency,
        input.rates.get(day),
      );
      if (value === null) metaPartial = true;
      else metaSpend = (metaSpend ?? 0) + value;
    }
  }
  return {
    since: input.since,
    until: input.today,
    currency: input.currency,
    sales,
    budget,
    metaSpend,
    activeDays: input.periods.length ? activeDays.size : null,
    activeHours: input.periods.length ? activeHours : null,
    timePartial: !input.timeComplete,
    salesPartial,
    budgetPartial,
    metaPartial,
  };
}
export type InventoryLifetimeSummary = ReturnType<
  typeof inventoryLifetimeSummary
>;
