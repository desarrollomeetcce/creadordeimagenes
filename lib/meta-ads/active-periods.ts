import type { AliasStateChange } from "./alias-state-timeline";
export type ActivePeriod = {
  id: string;
  from: string;
  until: string | null;
  since: string;
  through: string;
};
const limaDay = (instant: number) =>
  new Date(instant - 5 * 3600000).toISOString().slice(0, 10);
/** Starts are observed activation events, never inferred from today's default state. */
export function activePeriods(
  changes: AliasStateChange[],
  asOf: string,
): ActivePeriod[] {
  const now = Date.parse(asOf);
  if (!Number.isFinite(now)) return [];
  const events = changes
    .filter(
      (e) =>
        Number.isFinite(Date.parse(e.createdAt)) &&
        Date.parse(e.createdAt) <= now,
    )
    .sort(
      (a, b) =>
        Date.parse(a.createdAt) - Date.parse(b.createdAt) ||
        a.id.localeCompare(b.id),
    );
  const periods: ActivePeriod[] = [];
  let start: AliasStateChange | null = null;
  for (const e of events) {
    if (e.active) {
      start ??= e;
    } else if (start) {
      const from = Date.parse(start.createdAt),
        end = Date.parse(e.createdAt);
      periods.push({
        id: start.id,
        from: start.createdAt,
        until: e.createdAt,
        since: limaDay(from),
        through: limaDay(Math.max(from, end - 1)),
      });
      start = null;
    }
  }
  if (start)
    periods.push({
      id: start.id,
      from: start.createdAt,
      until: null,
      since: limaDay(Date.parse(start.createdAt)),
      through: limaDay(now),
    });
  return periods.reverse();
}
/** Financial reads stay within31 days, with explicit pages for a longer actual active period. */
export function activePeriodWindow(
  since: string,
  until: string,
  pageSince = since,
) {
  const first = Math.max(
      Date.parse(since),
      Math.min(Date.parse(until), Date.parse(pageSince)),
    ),
    last = Math.min(Date.parse(until), first + 30 * 86400000);
  return {
    since: new Date(first).toISOString().slice(0, 10),
    until: new Date(last).toISOString().slice(0, 10),
    previous:
      first > Date.parse(since)
        ? new Date(Math.max(Date.parse(since), first - 31 * 86400000))
            .toISOString()
            .slice(0, 10)
        : null,
    next:
      last < Date.parse(until)
        ? new Date(last + 86400000).toISOString().slice(0, 10)
        : null,
  };
}
