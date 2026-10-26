import { z } from "zod";
export const assignmentTimingSchema = z.object({
  day: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((v) => {
      const d = new Date(v + "T00:00:00Z");
      return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
    }, "Fecha inválida."),
  mode: z.enum(["DAY", "CLOCK"]),
  time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .optional(),
  cutoffSales: z.number().int().min(0).max(2147483647).optional(),
  token: z.string().length(64).optional(),
});
export type AssignmentChange = {
  id: string;
  advisorId: string | null;
  previousAdvisorId: string | null;
  effectiveAt: Date;
  createdAt: Date;
  mode: string;
  cutoffSales: number | null;
};
export function limaDay(date = new Date()) {
  return new Date(date.getTime() - 5 * 3600000).toISOString().slice(0, 10);
}
export function assignmentTimeline(changes: AssignmentChange[]) {
  const recorded = [...changes].sort(
    (a, b) =>
      a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id),
  );
  const positions = new Map(recorded.map((e, i) => [e.id, i]));
  const overrides = new Map<string, AssignmentChange>();
  for (const e of recorded)
    if (e.mode === "DAY") overrides.set(limaDay(e.effectiveAt), e);
  return recorded
    .filter((e) => {
      const override = overrides.get(limaDay(e.effectiveAt));
      return !override || positions.get(e.id)! >= positions.get(override.id)!;
    })
    .sort(
      (a, b) =>
        a.effectiveAt.getTime() - b.effectiveAt.getTime() ||
        a.createdAt.getTime() - b.createdAt.getTime() ||
        a.id.localeCompare(b.id),
    );
}
/** Sales are cumulative daily counts. Clock boundaries are explicit count cuts, never time prorations. */
export function attributeDailySales(
  currentAdvisorId: string | null,
  changes: AssignmentChange[],
  day: string,
  total: number | null,
  na: boolean,
) {
  const start = Date.parse(day + "T00:00:00-05:00"),
    end = start + 86400000;
  const recorded = [...changes].sort(
    (a, b) =>
      a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id),
  );
  const ordered = assignmentTimeline(changes);
  let advisor = recorded.length
    ? recorded[0].previousAdvisorId
    : currentAdvisorId;
  let legacy = !!advisor;
  for (const e of ordered)
    if (e.effectiveAt.getTime() <= start) {
      advisor = e.advisorId;
      legacy = false;
    }
  const inside = ordered.filter(
    (e) => e.effectiveAt.getTime() > start && e.effectiveAt.getTime() < end,
  );
  const portions = new Map<
    string,
    { sales: number | null; na: boolean; partial: boolean; legacy: boolean }
  >();
  const add = (
    id: string | null,
    value: number | null,
    isNa: boolean,
    partial: boolean,
    old: boolean,
  ) => {
    if (!id) return;
    const previous = portions.get(id);
    if (!previous)
      portions.set(id, { sales: value, na: isNa, partial, legacy: old });
    else
      portions.set(id, {
        sales:
          previous.sales === null
            ? value
            : value === null
              ? previous.sales
              : previous.sales + value,
        na: previous.na && isNa,
        partial:
          previous.partial ||
          partial ||
          ((previous.sales === null) !== (value === null) &&
            !isNa &&
            !previous.na),
        legacy: previous.legacy || old,
      });
  };
  const cuts = inside.map((e) => e.cutoffSales);
  const invalid =
    cuts.some((c, i) => c === null || c < 0 || (i > 0 && c < cuts[i - 1]!)) ||
    (total !== null && cuts.some((c) => c! > total)) ||
    (na && cuts.some((c) => c! > 0));
  let cut = 0;
  for (const e of inside) {
    add(
      advisor,
      invalid ? null : e.cutoffSales! - cut,
      na && !invalid,
      invalid,
      legacy,
    );
    cut = e.cutoffSales ?? cut;
    advisor = e.advisorId;
    legacy = false;
  }
  add(
    advisor,
    invalid || na || total === null ? null : total - cut,
    na && !invalid,
    invalid,
    legacy,
  );
  return [...portions].map(([advisorId, v]) => ({ advisorId, ...v }));
}
