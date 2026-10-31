import { advisorMetaPeriods } from "./advisor-meta-periods";
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
    const metaPeriods = advisorMetaPeriods(row.advisorId, row.changes, asOf);
    for (const day of dates) {
      const start = Date.parse(day + "T00:00:00-05:00"),
        end = Math.min(start + 86400000, asOf.getTime());
      if (end <= start) continue;
      const withinDay = (p: (typeof periods)[number]) =>
        (p.from === null || Date.parse(p.from) < end) &&
        (p.until === null || Date.parse(p.until) > start);
      const overlapping = periods.filter(withinDay);
      const metaOverlapping = metaPeriods.filter(withinDay);
      const exclusiveOwner = (parts: typeof periods) => {
        const owners = [...new Set(parts.map((p) => p.advisorId))];
        return owners.length === 1 &&
          parts.some(
            (p) =>
              (p.from === null || Date.parse(p.from) <= start) &&
              (p.until === null || Date.parse(p.until) >= end),
          )
          ? owners[0]
          : null;
      };
      const budgetOwner = exclusiveOwner(overlapping);
      const metaOwner = exclusiveOwner(metaOverlapping);
      const recordedSales = row.attributedSales?.[day];
      const owners = [
        ...new Set([
          ...[...overlapping, ...metaOverlapping].map((p) => p.advisorId),
          ...Object.keys(recordedSales ?? {}),
        ]),
      ];
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
        const hasMetaPeriod = metaOverlapping.some((p) => p.advisorId === id);
        sum.assignmentPartial ||= hasMetaPeriod && metaOwner !== id;
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
        if (budgetOwner === id) {
          const budget =
            cell && !cell.na.includes("budget") ? cell.budget : null;
          if (budget !== null) money.budget = (money.budget ?? 0) + budget;
          money.budgetPartial ||=
            budget === null || !!cell?.partialMetrics.includes("budget");
        } else if (overlapping.some((p) => p.advisorId === id))
          money.budgetPartial = true;
        if (metaOwner === id) {
          const spend = cell?.metaSpend ?? null;
          if (spend !== null) money.spend = (money.spend ?? 0) + spend;
          if (cell?.sourceBase !== null && cell?.sourceBase !== undefined)
            sum.base = (sum.base ?? 0) + cell.sourceBase;
        }
        // Sales allocations are independent of who owns the Meta source. They
        // contribute to the advisor's denominator without moving B, G or P.
        if (sales !== null) money.sales = (money.sales ?? 0) + sales;
        money.partial ||=
          !!cell?.partialMetrics.includes("sales") ||
          (row.attributedSales
            ? !!recordedSales && id in recordedSales && sales === null
            : sales === null);
        if (hasMetaPeriod)
          sum.metaPartial ||=
            metaOwner !== id ||
            !cell ||
            cell.sourceBase == null ||
            cell.metaSpend == null ||
            cell.campaigns < row.campaigns;
        if (
          metaOwner === id &&
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
