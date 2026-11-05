type Period = {
  state: string;
  reportedMeta?: boolean;
  metaPartial?: boolean;
  results: number;
  spend: number;
  cost: number | null;
};
export const isObservedPartialPeriod = (p: Period) =>
  p.state === "UNAVAILABLE" && !!p.reportedMeta && !!p.metaPartial;
/** Display observed sums without claiming that an incomplete range is fully covered. */
export function observedPeriodCost(p: Period) {
  return isObservedPartialPeriod(p)
    ? p.results > 0
      ? p.spend / p.results
      : null
    : p.cost;
}
