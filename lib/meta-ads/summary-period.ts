export type SummaryView =
  "period" | "manual" | "automatic" | "today" | "yesterday" | "meta";
/** Keep history intact; cut only summary calculations at the last eligible business day. */
export function summaryPeriod(
  days: string[],
  view: SummaryView,
  today: string,
) {
  const last = new Date(today + "T12:00:00Z");
  if (view === "yesterday") last.setUTCDate(last.getUTCDate() - 1);
  const cutoff = last.toISOString().slice(0, 10);
  const selected =
    view === "today" || view === "yesterday"
      ? days.filter((day) => day <= cutoff)
      : days;
  return {
    days: selected,
    cutoff,
    end: selected.at(-1) ?? null,
    excluded: days.length - selected.length,
  };
}
