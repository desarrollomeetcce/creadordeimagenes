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
    return {
      currency,
      budget: sum("budget"),
      spend: sum("spend"),
      budgetCac: periodComparison(
        parts.map((p) => ({
          numerator: p?.budget ?? null,
          denominator: p?.sales ?? null,
        })),
        1,
      ).value,
      metaCac: periodComparison(
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
    base,
    effectiveness: periodComparison(
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
