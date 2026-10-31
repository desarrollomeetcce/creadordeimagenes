import { advisorAssignmentPeriods } from "./advisor-periods";
import type { AssignmentChange } from "./advisor-attribution";
/** Bootstrap Meta history belongs to the first responsible advisor. This is a
 * reporting rule only: never backdate assignment events or change sales periods. */
export function advisorMetaPeriods(
  current: string | null,
  changes: AssignmentChange[],
  asOf = new Date(),
  policy: { mode?: string; since?: string | null } = {},
) {
  const periods = advisorAssignmentPeriods(current, changes, asOf);
  const recorded = [...changes]
    .filter((c) => c.effectiveAt <= asOf)
    .sort(
      (a, b) =>
        a.createdAt.getTime() - b.createdAt.getTime() ||
        a.id.localeCompare(b.id),
    );
  const initialEvent = recorded.find((c) => c.previousAdvisorId || c.advisorId);
  const principal =
    initialEvent?.previousAdvisorId ?? initialEvent?.advisorId ?? current;
  const first = periods
    .filter((p) => p.from === null || p.until === null || p.from < p.until)
    .sort(
      (a, b) =>
        (a.from ?? "").localeCompare(b.from ?? "") || a.id.localeCompare(b.id),
    )[0];
  if (!first) return periods;
  const mode = policy.mode ?? "ALL";
  // A whole-day replacement may supersede an onboarding event on that same
  // date. It changes today's responsibility, not the earlier bootstrap owner.
  if (principal && first.advisorId !== principal && first.from) {
    const start =
      mode === "CUSTOM" && policy.since
        ? policy.since + "T00:00:00-05:00"
        : mode === "ASSIGNMENT"
          ? (initialEvent?.effectiveAt.toISOString() ?? null)
          : null;
    if (start && Date.parse(start) >= Date.parse(first.from)) return periods;
    return [
      ...periods,
      {
        id: "meta-initial:" + (initialEvent?.id ?? principal),
        advisorId: principal,
        from: start,
        until: first.from,
        since: start ? start.slice(0, 10) : null,
        through: new Date(Date.parse(first.from) - 1 - 5 * 3600000)
          .toISOString()
          .slice(0, 10),
        nextAdvisorId: first.advisorId,
      },
    ];
  }
  const from =
    mode === "CUSTOM" && policy.since
      ? policy.since + "T00:00:00-05:00"
      : mode === "ASSIGNMENT"
        ? (first.from ??
          (policy.since ? policy.since + "T00:00:00-05:00" : null))
        : null;
  return periods.map((p) =>
    p === first ? { ...p, from, since: from ? from.slice(0, 10) : null } : p,
  );
}
