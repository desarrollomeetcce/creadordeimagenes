import { cacSeverityOrder } from "./inventory-cac-policy";
const ranks: Record<string, number> = Object.fromEntries(
  cacSeverityOrder.map((s, i) => [s, i]),
);
type SortableMetaItem = {
  currency: string;
  metric: string;
  status: string | null;
  effectiveStatus: string | null;
  createdTime: Date | null;
  ageDays: number | null;
  firstDelivery?: string | null;
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
  const rank = (o: SortableMetaItem) =>
    o.status === "ACTIVE"
      ? o.effectiveStatus === "ACTIVE"
        ? 0
        : 1
      : !o.status && o.effectiveStatus === "ACTIVE"
        ? 1
        : o.status === "PAUSED"
          ? 2
          : 3;
  const priority = rank(a) - rank(b);
  if (priority) return priority;
  if (sort === "start") {
    const av =
      a.firstDelivery ?? a.createdTime?.toISOString().slice(0, 10) ?? null;
    const bv =
      b.firstDelivery ?? b.createdTime?.toISOString().slice(0, 10) ?? null;
    if (!av || !bv) return av === bv ? 0 : av ? -1 : 1;
    return direction * av.localeCompare(bv);
  }
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

export type DailySort = {
  key: "day" | "spend" | "results" | "cost";
  direction: "asc" | "desc";
};
type DailySortRow = {
  day: string;
  spend: number | null;
  results: number | null;
  cost: number | null;
};
export function compareDailyRows(
  a: DailySortRow,
  b: DailySortRow,
  sort: DailySort,
) {
  const direction = sort.direction === "asc" ? 1 : -1;
  if (sort.key === "day") return direction * a.day.localeCompare(b.day);
  const av = a[sort.key],
    bv = b[sort.key];
  // Missing measurements remain last, including descending order; they are not zero.
  if (av === null || bv === null)
    return av === bv ? a.day.localeCompare(b.day) : av === null ? 1 : -1;
  return direction * (av - bv) || a.day.localeCompare(b.day);
}

/** Missing CAC/state remain last in both directions. Compare money only within its currency. */
export function compareCampaignEvaluations(
  a: { currency: string; cac: number | null; status: string },
  b: { currency: string; cac: number | null; status: string },
  sort: "cac" | "evaluation",
  direction: number,
) {
  if (sort === "cac") {
    const av = a.cac,
      bv = b.cac;
    if (av === null || bv === null) return av === bv ? 0 : av === null ? 1 : -1;
    return a.currency.localeCompare(b.currency) || direction * (av - bv);
  }
  const av = ranks[a.status],
    bv = ranks[b.status];
  if (av === undefined || bv === undefined)
    return av === bv ? 0 : av === undefined ? 1 : -1;
  return direction * (av - bv);
}
