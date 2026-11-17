import { financialTaskPriority, type TaskRow } from "./financial-task-sections";
/** Visibility retention is independent of ordering: pinned inactive rows still sort below active rows. */
export function compareRowRetention(
  a: TaskRow & { active: boolean; pinned?: boolean },
  b: TaskRow & { active: boolean; pinned?: boolean },
  inactiveFirst = false,
  prioritizeTasks = true,
) {
  if (prioritizeTasks && !inactiveFirst)
    return financialTaskPriority(a) - financialTaskPriority(b);
  const order = Number(b.active) - Number(a.active);
  return inactiveFirst ? -order : order;
}

import { summarizePeriod, type PeriodCell } from "./period-summary";
export function periodSalesTotals<
  T extends {
    aliasId: string;
    country: string;
    days: Record<string, PeriodCell>;
  },
>(rows: T[], dates: string[]) {
  return new Map(
    rows.map((row) => [
      JSON.stringify([row.aliasId, row.country]),
      summarizePeriod(row.days, dates, "sales").total,
    ]),
  );
}
