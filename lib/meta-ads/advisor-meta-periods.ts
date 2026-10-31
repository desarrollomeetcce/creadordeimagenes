import { advisorAssignmentPeriods } from "./advisor-periods";
import type { AssignmentChange } from "./advisor-attribution";
/** Bootstrap Meta history belongs to the first responsible advisor. This is a
 * reporting rule only: never backdate assignment events or change sales periods. */
export function advisorMetaPeriods(
  current: string | null,
  changes: AssignmentChange[],
  asOf = new Date(),
) {
  const periods = advisorAssignmentPeriods(current, changes, asOf);
  if (periods.some((p) => p.from === null)) return periods;
  const first = periods
    .filter((p) => p.until === null || (p.from !== null && p.from < p.until))
    .sort(
      (a, b) =>
        (a.from ?? "").localeCompare(b.from ?? "") || a.id.localeCompare(b.id),
    )[0];
  return first
    ? periods.map((p) => (p === first ? { ...p, from: null, since: null } : p))
    : periods;
}
