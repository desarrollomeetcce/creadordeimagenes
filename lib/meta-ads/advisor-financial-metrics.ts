import { advisorAssignmentPeriods } from "./advisor-periods";
import type { AssignmentChange } from "./advisor-attribution";
import type { EffectivenessRow } from "./effectiveness";
export type AdvisorFinancialDay = {
  currencies: {
    currency: string;
    budget: number | null;
    spend: number | null;
    sales: number | null;
    partial: boolean;
    budgetPartial?: boolean;
  }[];
  base: number | null;
  metaPartial: boolean;
  assignmentPartial: boolean;
  updatedAt: string | null;
};
export type AdvisorFinancialRow = EffectivenessRow & {
  changes: AssignmentChange[];
  attributedSales?: Record<string, Record<string, number | null>>;
};
export function advisorFinancialMetrics(
  rows: AdvisorFinancialRow[],
  dates: string[],
  personIds: Set<string>,
  asOf = new Date(),
) {
  const output = new Map<string, Record<string, AdvisorFinancialDay>>();
  for (const row of rows) {
    const periods = advisorAssignmentPeriods(row.advisorId, row.changes, asOf);
    for (const day of dates) {
      const start = Date.parse(day + "T00:00:00-05:00"),
        end = Math.min(start + 86400000, asOf.getTime());
      if (end <= start) continue;
      const overlapping = periods.filter(
        (p) =>
          (p.from === null || Date.parse(p.from) < end) &&
          (p.until === null || Date.parse(p.until) > start),
      );
      const owners = [...new Set(overlapping.map((p) => p.advisorId))];
      // Full daily budgets/Meta reports cannot be apportioned between intraday handovers.
      const exclusive =
        owners.length === 1 &&
        overlapping.some(
          (p) =>
            (p.from === null || Date.parse(p.from) <= start) &&
            (p.until === null || Date.parse(p.until) >= end),
        );
      const cell = row.days[day];
      for (const id of owners.filter((id) => personIds.has(id))) {
        const days = output.get(id) ?? {};
        const sum = days[day] ?? {
          currencies: [],
          base: null,
          metaPartial: false,
          assignmentPartial: false,
          updatedAt: null,
        };
        sum.assignmentPartial ||= !exclusive;
        const currency = row.currency || "";
        let money = sum.currencies.find((c) => c.currency === currency);
        if (!money) {
          money = {
            currency,
            budget: null,
            spend: null,
            sales: null,
            partial: false,
          };
          sum.currencies.push(money);
        }
        const sales = row.attributedSales
          ? (row.attributedSales[day]?.[id] ?? null)
          : !cell?.na.includes("sales")
            ? (cell?.sales ?? null)
            : null;
        if (exclusive) {
          const budget =
            cell && !cell.na.includes("budget") ? cell.budget : null;
          const spend = cell?.metaSpend ?? null;
          if (budget !== null) money.budget = (money.budget ?? 0) + budget;
          if (spend !== null) money.spend = (money.spend ?? 0) + spend;
          if (sales !== null) money.sales = (money.sales ?? 0) + sales;
          if (cell?.sourceBase !== null && cell?.sourceBase !== undefined)
            sum.base = (sum.base ?? 0) + cell.sourceBase;
          money.budgetPartial ||=
            budget === null || !!cell?.partialMetrics.includes("budget");
          money.partial ||=
            sales === null || !!cell?.partialMetrics.includes("sales");
        } else money.partial = true;
        sum.metaPartial ||=
          !exclusive ||
          !cell ||
          cell.sourceBase == null ||
          cell.metaSpend == null ||
          cell.campaigns < row.campaigns;
        if (
          cell?.updatedAt &&
          (!sum.updatedAt || cell.updatedAt > sum.updatedAt)
        )
          sum.updatedAt = cell.updatedAt;
        days[day] = sum;
        output.set(id, days);
      }
    }
  }
  return output;
}
