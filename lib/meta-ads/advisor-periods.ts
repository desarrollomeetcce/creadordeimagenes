import { createHash } from "node:crypto";
import {
  assignmentTimeline,
  limaDay,
  type AssignmentChange,
} from "./advisor-attribution";
import { advisorSalesPlan } from "./advisor-sales-plan";
export type AssignmentPeriod = {
  id: string;
  advisorId: string;
  from: string | null;
  until: string | null;
  since: string | null;
  through: string;
  nextAdvisorId: string | null;
};
export function advisorAssignmentPeriods(
  current: string | null,
  changes: AssignmentChange[],
  asOf = new Date(),
): AssignmentPeriod[] {
  const ordered = assignmentTimeline(changes).filter(
      (e) => e.effectiveAt <= asOf,
    ),
    out: AssignmentPeriod[] = [];
  let who = ordered.length
    ? ([...changes].sort(
        (a, b) =>
          a.createdAt.getTime() - b.createdAt.getTime() ||
          a.id.localeCompare(b.id),
      )[0]?.previousAdvisorId ?? null)
    : current;
  let from: Date | null = null,
    id = ordered.length ? "legacy:" + ordered[0].id : "legacy";
  for (const e of ordered) {
    if (e.advisorId === who) {
      if (!from && who) {
        from = e.effectiveAt;
        id = e.id;
      }
      continue;
    }
    if (who)
      out.push({
        id,
        advisorId: who,
        from: from?.toISOString() ?? null,
        until: e.effectiveAt.toISOString(),
        since: from ? limaDay(from) : null,
        through: limaDay(
          new Date(Math.max(from?.getTime() ?? 0, e.effectiveAt.getTime() - 1)),
        ),
        nextAdvisorId: e.advisorId,
      });
    who = e.advisorId;
    from = e.effectiveAt;
    id = e.id;
  }
  if (who)
    out.push({
      id,
      advisorId: who,
      from: from?.toISOString() ?? null,
      until: null,
      since: from ? limaDay(from) : null,
      through: limaDay(asOf),
      nextAdvisorId: null,
    });
  return out.reverse();
}
/** Cumulative cuts locate sales at handovers; hours never determine a sale's owner. */
export function assignmentPeriodSales(
  current: string | null,
  changes: AssignmentChange[],
  period: AssignmentPeriod,
  day: string,
  total: number | null,
  na: boolean,
  approval?: Parameters<typeof advisorSalesPlan>[5],
) {
  const plan = advisorSalesPlan(current, changes, day, total, na, approval),
    start = Date.parse(day + "T00:00:00-05:00"),
    end = start + 86400000;
  const ordered = assignmentTimeline(changes),
    earliest = [...changes].sort(
      (a, b) =>
        a.createdAt.getTime() - b.createdAt.getTime() ||
        a.id.localeCompare(b.id),
    )[0];
  let who = earliest ? earliest.previousAdvisorId : current;
  let segmentPeriodId = ordered.length ? "legacy:" + ordered[0].id : "legacy";
  for (const e of ordered)
    if (
      e.effectiveAt.getTime() < start ||
      (e.effectiveAt.getTime() === start && e.mode === "DAY")
    ) {
      if (e.advisorId !== who || segmentPeriodId.startsWith("legacy")) {
        segmentPeriodId = e.id;
      }
      who = e.advisorId;
    }
  const inside = ordered.filter(
      (e) =>
        e.mode !== "DAY" &&
        e.effectiveAt.getTime() >= start &&
        e.effectiveAt.getTime() < end,
    ),
    cuts = inside.map((e) => e.cutoffSales);
  const invalid =
    cuts.some((v, i) => v === null || v < 0 || (i > 0 && v < cuts[i - 1]!)) ||
    (total !== null && cuts.some((v) => v! > total)) ||
    (na && cuts.some((v) => v! > 0));
  const segments: {
    advisorId: string | null;
    from: number;
    until: number;
    sales: number | null;
    periodId: string;
  }[] = [];
  let from = start,
    cut = 0;
  for (const e of inside) {
    segments.push({
      advisorId: who,
      periodId: segmentPeriodId,
      from,
      until: e.effectiveAt.getTime(),
      sales: invalid ? null : e.cutoffSales! - cut,
    });
    from = e.effectiveAt.getTime();
    cut = e.cutoffSales ?? cut;
    if (e.advisorId !== who || segmentPeriodId.startsWith("legacy"))
      segmentPeriodId = e.id;
    who = e.advisorId;
  }
  segments.push({
    advisorId: who,
    periodId: segmentPeriodId,
    from,
    until: end,
    sales: invalid || na || total === null ? null : total - cut,
  });
  const selected = segments.filter(
      (s) => s.advisorId === period.advisorId && s.periodId === period.id,
    ),
    all = segments.filter((s) => s.advisorId === period.advisorId);
  if (!selected.length) return { sales: null, na: false, partial: false };
  const approved = plan.portions.find((p) => p.advisorId === period.advisorId);
  if (plan.reconciled && approved) {
    if (all.length === selected.length)
      return {
        sales: approved.sales,
        na: approved.na,
        partial: approved.partial,
      };
    const raw = all.every((s) => s.sales !== null)
      ? all.reduce((n, s) => n + s.sales!, 0)
      : null;
    if (raw !== approved.sales)
      return { sales: null, na: false, partial: true };
  }
  return {
    sales: na
      ? null
      : selected.every((s) => s.sales !== null)
        ? selected.reduce((n, s) => n + s.sales!, 0)
        : null,
    na,
    partial:
      invalid ||
      plan.status === "PENDING" ||
      (selected.some((s) => s.sales === null) && total !== null),
  };
}

export const salesDayPeriodId = (
  rowId: string,
  day: string,
  advisorId: string,
) =>
  "sales:" +
  createHash("sha256")
    .update(JSON.stringify([rowId, day, advisorId]))
    .digest("hex");
