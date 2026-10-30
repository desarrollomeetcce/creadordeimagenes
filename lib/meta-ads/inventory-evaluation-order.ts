type EvaluationPoint = {
  activation: string;
  usage: string;
  assessment: { usage: number | null; status: string };
};
export type EvaluationMetric = "activation" | "factor" | "status";
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
