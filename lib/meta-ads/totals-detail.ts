import type { TotalValue } from "./effectiveness-total-values";
import type { SheetMetric } from "./period-summary";
export type ManualTotalMetric = "baseManual" | "totalSpend" | "fixedCost";
export type TotalDay = {
  sums: Record<SheetMetric, TotalValue>;
  manual: Partial<Record<ManualTotalMetric, number | "NA">>;
  revision: number;
};
export type TotalSheet = {
  tableId: string;
  name: string;
  missingFxDays: string[];
  groups: {
    country: string;
    currency: string;
    days: Record<string, TotalDay>;
  }[];
};
export const manualTotalColumns = [
  { key: "sales", label: "V", name: "Ventas", sum: true },
  { key: "budget", label: "P", name: "Presupuesto", sum: true },
  { key: "baseManual", label: "BM", name: "Base manual", sum: false },
  { key: "totalSpend", label: "GM", name: "Gasto manual", sum: false },
  { key: "fixedCost", label: "CF", name: "Costos fijos", sum: false },
] as const;
export const automaticTotalColumns = [
  { key: "sales", label: "V", name: "Ventas", sum: true },
  { key: "base", label: "B", name: "Base", sum: true },
  { key: "spend", label: "G", name: "Gasto", sum: true },
  { key: "fixedCost", label: "CF", name: "Costos fijos", sum: true },
] as const;
export type TotalColumn =
  (typeof manualTotalColumns)[number] | (typeof automaticTotalColumns)[number];
export function totalDetailValue(
  day: TotalDay | undefined,
  column: TotalColumn,
): TotalValue {
  if (column.sum)
    return (
      day?.sums[column.key as SheetMetric] ?? {
        value: null,
        known: 0,
        expected: 1,
        na: 0,
        pending: false,
        partial: true,
      }
    );
  const value = day?.manual[column.key as ManualTotalMetric];
  return {
    value: typeof value === "number" ? value : null,
    known: typeof value === "number" ? 1 : 0,
    expected: 1,
    na: value === "NA" ? 1 : 0,
    pending: false,
    partial: value === undefined,
  };
}
export function totalDetailSummary(values: TotalValue[]): TotalValue {
  const known = values.filter((v) => v.value !== null),
    pending = values.some((v) => v.pending);
  return {
    value:
      known.length && !pending
        ? known.reduce((sum, v) => sum + v.value!, 0)
        : null,
    known: known.length,
    expected: values.length,
    na: values.filter((v) => v.na > 0 && v.value === null).length,
    pending,
    partial: values.some((v) => v.partial || (!v.na && v.value === null)),
  };
}
