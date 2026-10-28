import {
  sheetDataFillLabels,
  type SheetDataFill,
} from "../../lib/meta-ads/sheet-data-fill";
export function SheetDataFillBadge({
  kind,
  nextDay = false,
  compact = false,
}: {
  kind: SheetDataFill;
  nextDay?: boolean;
  compact?: boolean;
}) {
  const label =
    sheetDataFillLabels[kind] +
    (kind === "automatic" && nextDay
      ? " · BM se registra en Totales al día siguiente"
      : "");
  return (
    <span
      className={
        "sheet-fill-badge" + (compact ? " sheet-fill-badge-compact" : "")
      }
      data-fill-kind={nextDay ? "next-day" : kind}
      role="img"
      title={label}
      aria-label={label}
    >
      {compact
        ? nextDay
          ? "D+1"
          : "●"
        : kind === "automatic"
          ? nextDay
            ? "Auto · D+1"
            : "Auto"
          : kind === "next-day"
            ? "D+1"
            : "Hoy"}
    </span>
  );
}
