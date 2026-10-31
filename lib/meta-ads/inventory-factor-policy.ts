import type { trialAssessment } from "./inventory-trial-policy";
export const defaultInventoryLimits = () =>
  Array.from({ length: 11 }, (_, sales) => (sales === 0 ? 25 : sales * 50));
export const inventoryFactorLimit = (
  sales: number,
  limits: readonly number[],
) => limits[sales] ?? (sales === 0 ? 25 : sales * 50);
/** Explicit sales-row limits override the default S/50 per sale; unknown data stays pending. */
export function inventoryFactorAssessment(
  sales: number | null,
  amount: number | null,
  complete: boolean,
  limits: readonly number[],
): ReturnType<typeof trialAssessment> {
  const limit = sales === null ? null : inventoryFactorLimit(sales, limits),
    usage = amount === null || limit === null ? null : amount / limit;
  return {
    limit,
    usage,
    status:
      !complete || sales === null || amount === null
        ? "PENDING"
        : amount >= limit!
          ? sales === 0
            ? "CRITICAL"
            : "ALERT"
          : sales === 0
            ? "TESTING"
            : "WITHIN",
  };
}
