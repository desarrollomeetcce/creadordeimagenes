import { manualTotalColumns, automaticTotalColumns } from "./totals-detail";
export type TotalDetailView = "manual" | "automatic" | "today" | "yesterday";
export const totalDetailViewNames: Record<TotalDetailView, string> = {
  manual: "Total manual",
  automatic: "Total automático",
  today: "Análisis de hoy",
  yesterday: "Análisis de ayer",
};
export function totalViewColumns(view: TotalDetailView) {
  if (view === "automatic") return [...automaticTotalColumns];
  const keys =
    view === "today"
      ? ["sales", "budget", "advisorBase"]
      : view === "yesterday"
        ? ["sales", "baseManual", "totalSpend", "fixedCost"]
        : manualTotalColumns.map((c) => c.key);
  return manualTotalColumns.filter((c) => keys.includes(c.key));
}
export function totalProductMetrics(view: TotalDetailView) {
  return view === "automatic"
    ? (["sales", "base", "spend", "fixedCost"] as const)
    : view === "yesterday"
      ? (["sales"] as const)
      : (["sales", "budget"] as const);
}
