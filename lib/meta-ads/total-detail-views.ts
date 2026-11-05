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
/** Compatible parameters remain opt-in; defaults omit retired columns without deleting history. */
export function totalViewColumns(
  view: TotalDetailView,
  enabled?: readonly string[] | null,
): TotalColumn[] {
  const available: readonly TotalColumn[] =
    view === "automatic"
      ? [...automaticTotalColumns, manualTotalColumns[1]]
      : manualTotalColumns;
  const keys =
    view === "today"
      ? ["sales", "budget"]
      : view === "yesterday"
        ? ["sales", "baseManual", "totalSpend"]
        : null;
  if (enabled) {
    const selected = available.filter((column) => enabled.includes(column.key));
    return selected.length ? selected : [available[0]];
  }
  return available.filter(
    (column) =>
      column.key !== "advisorBase" &&
      column.key !== "fixedCost" &&
      column.key !== "budget" &&
      (!keys || keys.includes(column.key)),
  );
}
export function totalProductMetrics(view: TotalDetailView) {
  return view === "automatic"
    ? (["sales", "base", "spend"] as const)
    : (["sales"] as const);
}
