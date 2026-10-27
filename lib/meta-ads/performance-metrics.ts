/** Counts and monetary investment are distinct: this ratio never assumes revenue or profit. */
export function performanceRatio(
  numerator: number | null,
  denominator: number | null,
  multiplier = 1,
) {
  if (
    numerator === null ||
    denominator === null ||
    denominator <= 0 ||
    !Number.isFinite(numerator) ||
    !Number.isFinite(denominator)
  )
    return null;
  return (numerator / denominator) * multiplier;
}
