export type AdvisorTrend = "improved" | "declined" | "steady" | "pending";
/** Compare equivalent percentages only; incomplete records never imply a trend. */
export function advisorPerformanceTrend(
  current: number | null,
  previous: number | null,
  partial = false,
  previousPartial = false,
): { kind: AdvisorTrend; delta: number | null } {
  if (
    current === null ||
    previous === null ||
    !Number.isFinite(current) ||
    !Number.isFinite(previous) ||
    partial ||
    previousPartial
  )
    return { kind: "pending", delta: null };
  const delta = current - previous;
  return Math.abs(delta) < 0.005
    ? { kind: "steady", delta: 0 }
    : { kind: delta > 0 ? "improved" : "declined", delta };
}
