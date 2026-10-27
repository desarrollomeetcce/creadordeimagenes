import {
  sheetMetrics,
  type PeriodCell,
  type SheetMetric,
} from "./period-summary";
export type TotalValue = {
  value: number | null;
  known: number;
  expected: number;
  na: number;
  pending: boolean;
  partial: boolean;
};
/** Sum one date across aliases of ONE exact country and presentation currency. */
export function sumEffectivenessDay(
  rows: { days: Record<string, PeriodCell>; campaigns: number }[],
  day: string,
): Record<SheetMetric, TotalValue> {
  return Object.fromEntries(
    sheetMetrics.map((m) => {
      let value = 0,
        known = 0,
        na = 0,
        pending = false,
        incomplete = false;
      for (const r of rows) {
        const c = r.days[day];
        if (c?.na?.includes(m.key)) {
          na++;
          continue;
        }
        const n = c?.[m.key];
        if (typeof n === "number" && Number.isFinite(n)) {
          value += n;
          known++;
          if (c.partialMetrics?.includes(m.key)) incomplete = true;
          if (
            (m.key === "spend" || m.key === "base") &&
            !c.manual?.includes(m.key) &&
            (c.campaigns ?? 0) < r.campaigns
          )
            incomplete = true;
        } else if (
          m.money &&
          c &&
          (c.fxPending
            ? c.fxPending.includes(m.key)
            : (m.key === "spend" && c.sourceSpend?.length) ||
              (m.key === "fixedCost" && c.sourceFixedCost?.length) ||
              c.manual?.includes(m.key))
        )
          pending = true;
      }
      return [
        m.key,
        {
          value: known && !pending ? value : null,
          known,
          expected: rows.length,
          na,
          pending,
          partial: incomplete || known + na < rows.length,
        },
      ];
    }),
  ) as Record<SheetMetric, TotalValue>;
}
