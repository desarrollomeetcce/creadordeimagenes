type SortableMetaItem = {
  currency: string;
  metric: string;
  status: string | null;
  effectiveStatus: string | null;
  createdTime: Date | null;
  ageDays: number | null;
  periods: Record<string, { cost: number | null; results: number }>;
};
// Apply before pagination, so all active objects precede inactive objects even
// across pages. Costs from different currencies/objectives stay incomparable.
export function compareMetaItems(
  a: SortableMetaItem,
  b: SortableMetaItem,
  sort: string,
  direction: number,
) {
  const active = (o: SortableMetaItem) =>
    (o.effectiveStatus ?? o.status) === "ACTIVE";
  const priority = Number(active(b)) - Number(active(a));
  if (priority) return priority;
  if (a.currency !== b.currency) return a.currency.localeCompare(b.currency);
  if (a.metric !== b.metric) return a.metric.localeCompare(b.metric);
  if (sort === "newest")
    return (b.createdTime?.valueOf() ?? 0) - (a.createdTime?.valueOf() ?? 0);
  if (sort === "age")
    return direction * ((a.ageDays ?? Infinity) - (b.ageDays ?? Infinity));
  const ap = a.periods[sort] ?? a.periods["7"],
    bp = b.periods[sort] ?? b.periods["7"];
  if (ap.cost === null || bp.cost === null)
    return ap.cost === bp.cost ? 0 : ap.cost === null ? 1 : -1;
  return direction * (ap.cost - bp.cost) || bp.results - ap.results;
}
