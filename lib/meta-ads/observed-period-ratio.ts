import { performanceRatio } from "./performance-metrics";
/** Provisional ratio of observed totals in one chosen period; never fills missing values with zero. */
export function observedPeriodRatio(
  parts: { numerator: number | null; denominator: number | null }[],
  multiplier = 100,
) {
  const numerator = parts.filter((p) => p.numerator !== null),
    denominator = parts.filter((p) => p.denominator !== null);
  return {
    value: performanceRatio(
      numerator.length ? numerator.reduce((n, p) => n + p.numerator!, 0) : null,
      denominator.length
        ? denominator.reduce((n, p) => n + p.denominator!, 0)
        : null,
      multiplier,
    ),
    partial: parts.some((p) => p.numerator === null || p.denominator === null),
  };
}
