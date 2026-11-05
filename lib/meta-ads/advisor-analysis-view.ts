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

/** Detail views retain the chosen range; legacy relative modes become manual. */
export function detailAnalysisView(
  view: AdvisorAnalysisView,
): "meta" | "period" {
  return view === "meta" ? "meta" : "period";
}
export const detailAnalysisViews = [
  ["meta", "Vista automática"],
  ["period", "Vista manual"],
] as const;

export function advisorEmploymentActive(config: unknown, id: string) {
  if (!config || typeof config !== "object" || Array.isArray(config)) return true;
  const ids = (config as Record<string, unknown>).advisorInactiveIds;
  return !Array.isArray(ids) || !ids.includes(id);
}
