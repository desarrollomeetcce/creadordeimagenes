export type AdvisorAnalysisView = "period" | "today" | "yesterday" | "meta";
export function advisorAnalysisDefaults(
  view: AdvisorAnalysisView,
  today: string,
  since: string,
  until: string,
) {
  const day =
    view === "yesterday"
      ? new Date(Date.parse(today + "T12:00:00Z") - 86400000)
          .toISOString()
          .slice(0, 10)
      : today;
  return view === "today" || view === "yesterday"
    ? { since: day, until: day, allInventory: true }
    : { since, until, allInventory: false };
}
