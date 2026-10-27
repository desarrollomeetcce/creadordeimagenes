import { z } from "zod";
import {
  attributeDailySales,
  assignmentTimeline,
  type AssignmentChange,
} from "./advisor-attribution";
export const salesAllocationsSchema = z
  .array(
    z
      .object({
        advisorId: z.string().min(1).max(80).nullable(),
        sales: z.number().int().min(0).max(2147483647),
      })
      .strict(),
  )
  .min(1)
  .max(1000)
  .refine(
    (v) => new Set(v.map((x) => x.advisorId)).size === v.length,
    "Asesor repetido.",
  );
export type SalesAllocation = z.infer<typeof salesAllocationsSchema>[number];
const basisSchema = z.object({
  events: z.array(z.string()),
  activeAdvisorId: z.string().nullable(),
});
type Approval = {
  salesTotal: number;
  allocations: unknown;
  basis: unknown;
  revision: number;
  approvedAt: Date;
};
export function advisorSalesPlan(
  current: string | null,
  changes: AssignmentChange[],
  day: string,
  total: number | null,
  na: boolean,
  approval?: Approval | null,
) {
  const start = Date.parse(day + "T00:00:00-05:00"),
    end = start + 86400000;
  const normalized = assignmentTimeline(changes),
    dayEvents = normalized.filter(
      (e) => e.effectiveAt.getTime() >= start && e.effectiveAt.getTime() < end,
    );
  const hasChange = dayEvents.some(
    (e) =>
      e.previousAdvisorId !== e.advisorId &&
      (e.previousAdvisorId !== null ||
        (e.mode === "CLOCK" && (e.cutoffSales ?? 0) > 0)),
  );
  const last = normalized.filter((e) => e.effectiveAt.getTime() < end).at(-1);
  const earliest = [...changes].sort(
    (a, b) =>
      a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id),
  )[0];
  const activeAdvisorId = last
    ? last.advisorId
    : earliest
      ? earliest.previousAdvisorId
      : current;
  const portions = attributeDailySales(current, changes, day, total, na, true);
  const events = dayEvents.map((e) => e.id);
  let approved = false,
    reconciled = false,
    allocationConflict = false;
  if (total !== null && !na && approval) {
    const saved = salesAllocationsSchema.safeParse(approval.allocations),
      basis = basisSchema.safeParse(approval.basis);
    if (
      saved.success &&
      basis.success &&
      saved.data.reduce((s, p) => s + p.sales, 0) === approval.salesTotal
    ) {
      const adjusted = new Map(
        saved.data.map((p) => [
          p.advisorId,
          { ...p, na: false, partial: false, legacy: false },
        ]),
      );
      const add = (id: string | null, value: number) => {
        const p = adjusted.get(id) ?? {
          advisorId: id,
          sales: 0,
          na: false,
          partial: false,
          legacy: false,
        };
        p.sales += value;
        adjusted.set(id, p);
      };
      const sameTotal = total === approval.salesTotal,
        sameTimeline = basis.data.events.every((id) => events.includes(id));
      if (!sameTotal) {
        if (sameTimeline) {
          let cursor = approval.salesTotal,
            active = basis.data.activeAdvisorId;
          for (const e of dayEvents.filter(
            (e) => !basis.data.events.includes(e.id),
          )) {
            const next = e.cutoffSales ?? 0;
            add(active, next - cursor);
            cursor = next;
            active = e.advisorId;
          }
          add(active, total - cursor);
        } else {
          // Manual daily ownership survives a replacement of the responsibility timeline.
          add(activeAdvisorId, total - approval.salesTotal);
        }
      }
      const values = [...adjusted.values()];
      if (
        values.every((p) => p.sales >= 0) &&
        values.reduce((s, p) => s + p.sales, 0) === total
      ) {
        portions.splice(0, portions.length, ...values);
        reconciled = true;
        approved =
          sameTotal ||
          (sameTimeline && basis.data.events.length === events.length);
      } else if (!sameTimeline) {
        allocationConflict = true;
        portions.splice(
          0,
          portions.length,
          ...saved.data.map((p) => ({
            ...p,
            sales: null,
            na: false,
            partial: true,
            legacy: false,
          })),
        );
      }
    }
  }
  const suggestions = portions.map((p) => ({ ...p }));
  for (const e of dayEvents)
    for (const id of [e.previousAdvisorId, e.advisorId])
      if (id && !suggestions.some((p) => p.advisorId === id))
        suggestions.push({
          advisorId: id,
          sales: total === null ? null : 0,
          na: false,
          partial: false,
          legacy: false,
        });
  return {
    hasChange,
    total,
    events,
    activeAdvisorId,
    portions,
    suggestions,
    status: approved
      ? ("APPROVED" as const)
      : hasChange || allocationConflict
        ? ("PENDING" as const)
        : ("AUTOMATIC" as const),
    revision: approval?.revision ?? 0,
    reconciled,
    approvedAt: approved ? approval!.approvedAt.toISOString() : null,
  };
}
