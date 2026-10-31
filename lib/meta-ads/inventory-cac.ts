import type { EffectivenessRow } from "./effectiveness";
import { convertMoney, type FxRates } from "./exchange-rates";
import {
  defaultCacRules,
  cacAssessment,
  type CacRules,
} from "./inventory-cac-policy";
export * from "./inventory-cac-policy";
/** Always preserves registered spend, even on an N/A sales day; blanks never become sales zero. */
export function inventoryCacSummary(input: {
  row: EffectivenessRow;
  since: string;
  until: string;
  rates: Map<string, FxRates>;
  rules?: CacRules;
}) {
  const { row, since, until } = input,
    rules = input.rules ?? defaultCacRules();
  const firstRecorded = Object.keys(row.days)
    .filter((day) => {
      const d = row.days[day];
      return (
        day >= since &&
        day <= until &&
        ((typeof d.sales === "number" && !d.na.includes("sales")) ||
          (typeof d.budget === "number" && !d.na.includes("budget")))
      );
    })
    .sort()[0];
  let sales: number | null = null,
    budget: number | null = null,
    spend: number | null = null,
    budgetPen: number | null = null,
    spendPen: number | null = null;
  let salesPartial = false,
    budgetPartial = false,
    metaPartial = false,
    days = 0,
    first: string | null = null;
  for (let at = Date.parse(since); at <= Date.parse(until); at += 86400000) {
    const day = new Date(at).toISOString().slice(0, 10),
      d = row.days[day];
    if (!d) {
      if (firstRecorded && day >= firstRecorded) {
        salesPartial = true;
        budgetPartial = true;
        metaPartial = true;
      }
      continue;
    }
    const v =
        typeof d.sales === "number" && !d.na.includes("sales") ? d.sales : null,
      p =
        typeof d.budget === "number" && !d.na.includes("budget")
          ? d.budget
          : null;
    const g = typeof d.metaSpend === "number" ? d.metaSpend : null;
    const registered = v !== null || p !== null;
    const noActivity = !registered && d.na.includes("sales");
    if (!registered && !noActivity && firstRecorded && day >= firstRecorded) {
      salesPartial = true;
      budgetPartial = true;
      metaPartial = true;
    }
    if (registered) {
      days++;
      first ??= day;
    }
    if (v !== null) sales = (sales ?? 0) + v;
    if (registered && v === null && !d.na.includes("sales"))
      salesPartial = true;
    if (d.partialMetrics.includes("sales")) salesPartial = true;
    if (p !== null) {
      budget = (budget ?? 0) + p;
      const pen = convertMoney(p, row.currency, "PEN", input.rates.get(day));
      if (pen === null) budgetPartial = true;
      else budgetPen = (budgetPen ?? 0) + pen;
    } else if (registered && !d.na.includes("budget")) budgetPartial = true;
    if (d.partialMetrics.includes("budget") || d.fxPending.includes("budget"))
      budgetPartial = true;
    const parts = d.sourceSpend ?? [];
    if (g !== null) spend = (spend ?? 0) + g;
    if (parts.length) {
      for (const part of parts) {
        const pen = convertMoney(
          part.amount,
          part.currency,
          "PEN",
          input.rates.get(day),
        );
        if (pen === null) metaPartial = true;
        else spendPen = (spendPen ?? 0) + pen;
      }
    } else if (g !== null) {
      const pen = convertMoney(g, row.currency, "PEN", input.rates.get(day));
      if (pen === null) metaPartial = true;
      else spendPen = (spendPen ?? 0) + pen;
    } else if (registered && !noActivity) metaPartial = true;
    if (g !== null && v === null && !d.na.includes("sales"))
      salesPartial = true;
  }
  const amount = (
    value: number | null,
    pen: number | null,
    partial: boolean,
  ) => ({
    amount: value,
    penAmount: pen,
    cac: sales !== null && sales > 0 && value !== null ? value / sales : null,
    partial: partial || salesPartial,
    assessment: cacAssessment(sales, pen, !partial && !salesPartial, rules),
  });
  return {
    since,
    until,
    rules,
    currency: row.currency,
    sales,
    salesPartial,
    days,
    first,
    budget: amount(budget, budgetPen, budgetPartial),
    meta: amount(spend, spendPen, metaPartial),
  };
}
export type InventoryCacSummary = ReturnType<typeof inventoryCacSummary>;
