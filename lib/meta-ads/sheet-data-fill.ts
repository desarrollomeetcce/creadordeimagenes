export type SheetDataFill = "automatic" | "manual" | "next-day";
export const sheetDataFillLabels: Record<SheetDataFill, string> = {
  automatic: "Automático · recibido o calculado desde otras tablas",
  manual: "Manual · se completa el mismo día",
  "next-day": "Manual · se completa al día siguiente para esta fecha",
};
export const fillNextDay = (metric: string) =>
  metric === "baseManual" || metric === "totalSpend";
export function totalDataFill(column: {
  key: string;
  sum: boolean;
}): SheetDataFill {
  return column.sum
    ? "automatic"
    : fillNextDay(column.key)
      ? "next-day"
      : "manual";
}
export function sheetMetricDataFill(
  metric: string,
  options: {
    linked?: boolean;
    synced?: boolean;
    manual?: boolean;
    automaticNa?: boolean;
    received?: boolean;
  } = {},
): SheetDataFill {
  if (
    options.linked ||
    options.synced ||
    options.automaticNa ||
    options.received
  )
    return "automatic";
  if ((metric === "base" || metric === "spend") && !options.manual)
    return "automatic";
  return fillNextDay(metric) ? "next-day" : "manual";
}
