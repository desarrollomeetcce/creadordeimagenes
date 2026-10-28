import { performanceRatio } from "./performance-metrics";
/** Never divide sales from one set of dates by a base/cost from another. */
export function periodComparison(
  days: { numerator: number | null; denominator: number | null }[],
  multiplier = 100,
) {
  const mismatched = days.some(
    (d) => (d.numerator === null) !== (d.denominator === null),
  );
  const matched = days.filter(
    (d) => d.numerator !== null && d.denominator !== null,
  );
  const numerator = matched.length
    ? matched.reduce((n, d) => n + d.numerator!, 0)
    : null;
  const denominator = matched.length
    ? matched.reduce((n, d) => n + d.denominator!, 0)
    : null;
  return {
    value: mismatched
      ? null
      : performanceRatio(numerator, denominator, multiplier),
    mismatched,
    matchedDays: matched.length,
  };
}
