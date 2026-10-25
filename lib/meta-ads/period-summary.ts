export const sheetMetrics = [
  { key: "sales", label: "V", name: "Ventas", money: false },
  { key: "base", label: "B", name: "Conversaciones", money: false },
  { key: "spend", label: "G", name: "Gasto", money: true },
  { key: "fixedCost", label: "CF", name: "Costos fijos", money: true },
] as const;
export type SheetMetric = (typeof sheetMetrics)[number]["key"];
export type PeriodMode = "total" | "average";
export type MetricRange = { min?: number; max?: number };
export type PeriodCell = {
  sales: number | null;
  base: number | null;
  spend: number | null;
  fixedCost: number | null;
  campaigns?: number;
  na?: readonly SheetMetric[];
  sourceSpend?: unknown[];
  sourceFixedCost?: unknown[];
};
export type PeriodSummary = {
  total: number | null;
  average: number | null;
  knownDays: number;
  periodDays: number;
  partial: boolean;
  conversionPending: boolean;
};
export function summarizePeriod(
  cells: Record<string, PeriodCell>,
  dates: string[],
  metric: SheetMetric,
  expectedCampaigns = 0,
): PeriodSummary {
  let sum = 0,
    known = 0,
    pending = false,
    incomplete = false;
  for (const day of dates) {
    const c = cells[day],
      v = c?.[metric];
    if (c?.na?.includes(metric)) continue;
    if (typeof v === "number" && Number.isFinite(v)) {
      sum += v;
      known++;
      if (
        (metric === "base" || metric === "spend") &&
        expectedCampaigns > 0 &&
        (c.campaigns ?? 0) < expectedCampaigns
      )
        incomplete = true;
    } else if (
      (metric === "spend" && c?.sourceSpend?.length) ||
      (metric === "fixedCost" && c?.sourceFixedCost?.length)
    )
      pending = true;
  }
  const total = known && !pending ? sum : null;
  return {
    total,
    average: total === null ? null : sum / known,
    knownDays: known,
    periodDays: dates.length,
    partial: known < dates.length || incomplete,
    conversionPending: pending,
  };
}
export function matchesMetricRange(value: number | null, range?: MetricRange) {
  if (!range || (range.min === undefined && range.max === undefined))
    return true;
  if (value === null || !Number.isFinite(value)) return false;
  const tolerance = (bound: number) =>
    Number.EPSILON * Math.max(1, Math.abs(value), Math.abs(bound)) * 8;
  return (
    (range.min === undefined || value + tolerance(range.min) >= range.min) &&
    (range.max === undefined || value - tolerance(range.max) <= range.max)
  );
}
/** Unknown values stay last in either direction. Different monetary units form separate groups. */
export function compareSheetNumbers(
  a: number | null,
  b: number | null,
  direction: "asc" | "desc",
  unitA = "",
  unitB = "",
) {
  const missingA = a === null || !Number.isFinite(a),
    missingB = b === null || !Number.isFinite(b);
  if (missingA || missingB)
    return missingA === missingB ? 0 : missingA ? 1 : -1;
  if (unitA !== unitB) return unitA.localeCompare(unitB);
  const delta = a! - b!,
    tolerance = Number.EPSILON * Math.max(1, Math.abs(a!), Math.abs(b!)) * 8;
  return Math.abs(delta) <= tolerance
    ? 0
    : direction === "asc"
      ? delta
      : -delta;
}
