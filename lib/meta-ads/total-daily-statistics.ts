import {
  cacAssessment,
  defaultCacRules,
  type CacRules,
} from "./inventory-cac-policy";
import { performanceRatio } from "./performance-metrics";
import type { TotalDay } from "./totals-detail";
export type TotalDailyStatistics = {
  effectiveness: number | null;
  cac: number | null;
  status: ReturnType<typeof cacAssessment>["status"];
  partial: boolean;
  fxPending: boolean;
};
/** One source sheet + country + currency + business date; ratios of totals, never averages of diploma ratios. */
export function totalDailyStatistics(
  cell: TotalDay | undefined,
  mode: "manual" | "automatic",
  amountPen: number | null,
  rules: CacRules = defaultCacRules(),
): TotalDailyStatistics {
  const sales = cell?.sums.sales,
    base = mode === "automatic" ? cell?.metaSums?.base : undefined,
    spend = mode === "automatic" ? cell?.metaSums?.spend : undefined;
  const v = sales?.value ?? null,
    b =
      mode === "automatic"
        ? (base?.value ?? null)
        : typeof cell?.manual.baseManual === "number"
          ? cell.manual.baseManual
          : null,
    g =
      mode === "automatic"
        ? (spend?.value ?? null)
        : typeof cell?.manual.totalSpend === "number"
          ? cell.manual.totalSpend
          : null;
  const applicable = !(
    sales &&
    sales.known === 0 &&
    sales.na > 0 &&
    sales.na === sales.expected
  );
  const assessment = cacAssessment(
    v,
    amountPen,
    applicable && v !== null && amountPen !== null,
    rules,
    applicable && amountPen !== null,
  );
  return {
    effectiveness: performanceRatio(v, b, 100),
    cac: performanceRatio(g, v),
    status: assessment.status,
    partial: !!(
      sales?.partial ||
      (mode === "automatic" && (base?.partial || spend?.partial)) ||
      v === null ||
      g === null
    ),
    fxPending: g !== null && amountPen === null,
  };
}
