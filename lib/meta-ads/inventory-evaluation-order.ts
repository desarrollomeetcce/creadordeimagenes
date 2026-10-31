type EvaluationPoint = {
  activation: string;
  usage: string;
  assessment: { usage: number | null; status: string };
};
export type EvaluationMetric = "activation" | "factor" | "status";
/** Unknown/pending results stay last in either direction. */
export function compareFinancialStatus(
  a: string | undefined,
  b: string | undefined,
  criticalFirst: boolean,
) {
  const ranks: Record<string, number> = {
    CRITICAL: 4,
    ALERT: 3,
    TESTING: 2,
    WITHIN: 1,
  };
  const x = a ? ranks[a] : undefined,
    y = b ? ranks[b] : undefined;
  return x === undefined || y === undefined
    ? x === y
      ? 0
      : x === undefined
        ? 1
        : -1
    : criticalFirst
      ? y - x
      : x - y;
}
export function compareInventoryEvaluation(
  a: EvaluationPoint | undefined,
  b: EvaluationPoint | undefined,
  metric: EvaluationMetric,
  ascending: boolean,
) {
  const score = (p: EvaluationPoint | undefined): number | null => {
    if (!p) return null;
    if (metric === "activation")
      return (
        (
          { ACTIVE: 3, MIXED: 2, INACTIVE: 1, UNKNOWN: 0 } as Record<
            string,
            number
          >
        )[p.activation] ?? null
      );
    if (metric === "factor") return p.assessment.usage;
    if (p.usage === "NEVER") return null;
    return (
      (
        { CRITICAL: 4, ALERT: 3, TESTING: 2, WITHIN: 1, PENDING: 0 } as Record<
          string,
          number
        >
      )[p.assessment.status] ?? null
    );
  };
  const x = score(a),
    y = score(b);
  return x === null || y === null
    ? x === y
      ? 0
      : x === null
        ? 1
        : -1
    : ascending
      ? x - y
      : y - x;
}
