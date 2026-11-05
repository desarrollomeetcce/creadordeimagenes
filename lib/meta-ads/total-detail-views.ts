import {
  manualTotalColumns,
  automaticTotalColumns,
  type TotalColumn,
} from "./totals-detail";
export type TotalDetailView = "manual" | "automatic" | "today" | "yesterday";
export const totalDetailViewNames: Record<TotalDetailView, string> = {
  manual: "Total manual",
  automatic: "Total automático",
  today: "Hoy · avance provisional",
  yesterday: "Ayer · día completo",
};
/** Totals presentation omits retired BC sums and fixed-cost entry, preserving stored history. */
export function totalViewColumns(view: TotalDetailView): TotalColumn[] {
  const available: readonly TotalColumn[] =
    view === "automatic" ? automaticTotalColumns : manualTotalColumns;
  const keys =
    view === "today"
      ? ["sales", "budget"]
      : view === "yesterday"
        ? ["sales", "baseManual", "totalSpend"]
        : null;
  return available.filter(
    (column) =>
      column.key !== "advisorBase" &&
      column.key !== "fixedCost" &&
      (!keys || keys.includes(column.key)),
  );
}
export function totalProductMetrics(view: TotalDetailView) {
  return view === "automatic"
    ? (["sales", "base", "spend"] as const)
    : view === "yesterday"
      ? (["sales"] as const)
      : (["sales", "budget"] as const);
}
