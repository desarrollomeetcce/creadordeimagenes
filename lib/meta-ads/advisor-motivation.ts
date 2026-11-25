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

export function advisorGoalStatus(
  value: number | null,
  target: number | null,
  partial: boolean,
  closeBy: number,
): "met" | "close" | "progress" | "pending" | "unset" {
  if (target === null) return "unset";
  if (value === null || partial) return "pending";
  if (value >= target) return "met";
  return target - value <= closeBy + 1e-9 ? "close" : "progress";
}
