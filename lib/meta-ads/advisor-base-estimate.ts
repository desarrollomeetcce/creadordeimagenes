import { advisorAssignmentPeriods } from "./advisor-periods";
import type { AssignmentChange } from "./advisor-attribution";
import {
  sumEffectivenessDay,
  type TotalValue,
} from "./effectiveness-total-values";
import type { PeriodCell } from "./period-summary";
export type AdvisorBaseEstimate = {
  scope: "ASSIGNED_FULL_DAY_ESTIMATE";
  advisorId: string;
  days: Record<string, TotalValue>;
};
/** A daily contextual estimate, never a person-level allocation or a time proration. */
export function advisorBaseEstimate(
  rows: {
    advisorId: string | null;
    campaigns: number;
    days: Record<string, PeriodCell & { sourceBase?: number | null }>;
    changes: AssignmentChange[];
  }[],
  dates: string[],
  advisorId: string,
  asOf = new Date(),
  rawMeta = false,
): AdvisorBaseEstimate {
  const periods = rows.map((row) => ({
    row,
    periods: advisorAssignmentPeriods(row.advisorId, row.changes, asOf),
  }));
  return {
    scope: "ASSIGNED_FULL_DAY_ESTIMATE",
    advisorId,
    days: Object.fromEntries(
      dates.map((day) => {
        const start = Date.parse(day + "T00:00:00-05:00"),
          end = start + 86400000;
        const eligible = periods
          .filter(
            ({ row, periods }) =>
              (!rawMeta || row.campaigns > 0) &&
              periods.some(
                (p) =>
                  p.advisorId === advisorId &&
                  (p.from === null || Date.parse(p.from) < end) &&
                  (p.until === null ? asOf.getTime() : Date.parse(p.until)) >
                    start &&
                  (p.from === null || p.until === null || p.from < p.until),
              ),
          )
          .map(({ row }) => {
            const cell = row.days[day];
            if (!rawMeta || !cell) return row;
            return {
              ...row,
              days: {
                [day]: {
                  ...cell,
                  base: cell.sourceBase ?? null,
                  manual: cell.manual?.filter((metric) => metric !== "base"),
                  partialMetrics: cell.partialMetrics?.filter(
                    (metric) => metric !== "base",
                  ),
                  na: cell.na?.filter((metric) => metric !== "base"),
                },
              },
            };
          });
        return [day, sumEffectivenessDay(eligible, day).base];
      }),
    ),
  };
}
