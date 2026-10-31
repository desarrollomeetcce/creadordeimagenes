import type { EffectivenessRow } from "./effectiveness";
import { inventoryLifetimeSummary } from "./inventory-lifetime-summary";
import { reportingActivity } from "./reporting-activity";
import {
  defaultInventoryLimits,
  inventoryFactorAssessment,
} from "./inventory-factor-policy";
import { convertMoney, type FxRates } from "./exchange-rates";
export function inventoryReportSummary(input: {
  row: EffectivenessRow;
  events: { id: string; active: boolean; createdAt: string }[];
  asOf: string;
  rates: Map<string, FxRates>;
  limits?: readonly number[];
  since?: string;
  until?: string;
}) {
  const activity = reportingActivity(input.row.days, input.events, input.asOf);
  const today = new Date(Date.parse(input.asOf) - 18000000)
    .toISOString()
    .slice(0, 10);
  const since = input.since ?? activity.since ?? today,
    until = input.until ?? today;
  const periods = activity.periods.flatMap((p) => {
    const from = new Date(
      Math.max(Date.parse(p.from), Date.parse(since + "T00:00:00-05:00")),
    ).toISOString();
    const end = Math.min(
      Date.parse(p.until ?? input.asOf),
      Date.parse(until + "T00:00:00-05:00") + 86400000,
    );
    return end > Date.parse(from)
      ? [
          {
            ...p,
            from,
            until: new Date(end).toISOString(),
            since: p.since < since ? since : p.since,
            through: p.through > until ? until : p.through,
          },
        ]
      : [];
  });
  const meta = Object.entries(input.row.days).flatMap(([day, d]) =>
    (d.sourceSpend ?? []).map((p) => ({
      day,
      currency: p.currency,
      amount: p.amount,
    })),
  );
  const s = inventoryLifetimeSummary({
    since,
    today: until,
    asOf: input.asOf,
    currency: input.row.currency,
    periods,
    timeComplete: !!activity.since,
    days: input.row.days,
    meta,
    rates: input.rates,
  });
  // Factor limits are denominated in PEN, independently of the display currency.
  const amountPen = (key: "budget" | "metaSpend") => {
    let total: number | null = null,
      complete = true;
    const dates = new Set(
      periods.flatMap((p) =>
        Object.keys(input.row.days).filter(
          (d) => d >= p.since && d <= p.through,
        ),
      ),
    );
    for (const day of dates) {
      const d = input.row.days[day],
        value = d[key];
      const pen =
        typeof value === "number"
          ? convertMoney(value, input.row.currency, "PEN", input.rates.get(day))
          : null;
      if (pen === null) complete = false;
      else total = (total ?? 0) + pen;
    }
    return { total, complete };
  };
  const budget = amountPen("budget"),
    spend = amountPen("metaSpend");
  return {
    ...s,
    since: activity.since,
    currentSince: activity.currentSince,
    firstRegistration: activity.firstRegistration,
    inferred: activity.inferred,
    activeHours: activity.inferred ? null : s.activeHours,
    budgetCac:
      s.sales !== null && s.sales > 0 && s.budget !== null
        ? s.budget / s.sales
        : null,
    metaCac:
      s.sales !== null && s.sales > 0 && s.metaSpend !== null
        ? s.metaSpend / s.sales
        : null,
    budgetAssessment: inventoryFactorAssessment(
      s.sales,
      budget.total,
      budget.complete && !s.salesPartial && !s.budgetPartial,
      input.limits ?? defaultInventoryLimits(),
    ),
    metaAssessment: inventoryFactorAssessment(
      s.sales,
      spend.total,
      spend.complete && !s.salesPartial && !s.metaPartial,
      input.limits ?? defaultInventoryLimits(),
    ),
  };
}
export type InventoryReportSummary = ReturnType<typeof inventoryReportSummary>;
