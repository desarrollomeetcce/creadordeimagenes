import { cacAssessment } from "./inventory-cac-policy";
import { observedPeriodRatio } from "./observed-period-ratio";
import { periodComparison } from "./period-comparison";
import type { AdvisorFinancialDay } from "./advisor-financial-metrics";
export function advisorFinancialSummary(
  days: {
    day: string;
    sales: number | null;
    financial?: AdvisorFinancialDay;
  }[],
) {
  const currencies = [
    ...new Set(
      days.flatMap((d) => d.financial?.currencies.map((c) => c.currency) ?? []),
    ),
  ];
  const money = currencies.map((currency) => {
    const parts = days.map((d) =>
      d.financial?.currencies.find((c) => c.currency === currency),
    );
    const sum = (key: "budget" | "spend") =>
      parts.some((p) => p?.[key] != null)
        ? parts.reduce((n, p) => n + (p?.[key] ?? 0), 0)
        : null;
    const salesParts = parts.filter((p) => p?.sales != null);
    const sales = salesParts.length
      ? salesParts.reduce((n, p) => n + p!.sales!, 0)
      : null;
    const penParts = parts.map(
      (p) => p?.spendPen ?? (currency === "PEN" ? (p?.spend ?? null) : null),
    );
    const fxPending = parts.some(
      (p, i) => p?.spend != null && (p.spendPenPartial || penParts[i] === null),
    );
    const amountPen =
      fxPending || !penParts.some((p) => p !== null)
        ? null
        : penParts.reduce<number>((n, p) => n + (p ?? 0), 0);
    const assessment = cacAssessment(
      sales,
      amountPen,
      sales !== null && amountPen !== null,
      undefined,
      amountPen !== null,
    );
    return {
      currency,
      status: assessment.status,
      fxPending,
      statusPartial:
        parts.some((p) => !p || p.partial || p.sales === null) ||
        days.some(
          (d) =>
            !d.financial ||
            d.financial.metaPartial ||
            d.financial.assignmentPartial,
        ),
      budget: sum("budget"),
      spend: sum("spend"),
      budgetCac: periodComparison(
        parts.map((p) => ({
          numerator: p?.budget ?? null,
          denominator: p?.sales ?? null,
        })),
        1,
      ).value,
      metaCac: observedPeriodRatio(
        parts.map((p) => ({
          numerator: p?.spend ?? null,
          denominator: p?.sales ?? null,
        })),
        1,
      ).value,
      partial: parts.some((p) => !p || p.partial),
      budgetPartial: parts.some((p) => !p || p.budgetPartial),
    };
  });
  const base = days.some((d) => d.financial?.base != null)
    ? days.reduce((n, d) => n + (d.financial?.base ?? 0), 0)
    : null;
  return {
    money,
    hasMetaSource: days.some(
      (d) =>
        d.financial?.hasMetaSource ||
        d.financial?.base != null ||
        d.financial?.currencies.some((c) => c.spend != null),
    ),
    base,
    effectiveness: observedPeriodRatio(
      days.map((d) => ({
        numerator: d.sales,
        denominator: d.financial?.base ?? null,
      })),
    ).value,
    metaPartial: days.some((d) => !d.financial || d.financial.metaPartial),
    assignmentPartial: days.some((d) => d.financial?.assignmentPartial),
    updatedAt:
      days
        .map((d) => d.financial?.updatedAt)
        .filter((d): d is string => !!d)
        .sort()
        .at(-1) ?? null,
  };
}
