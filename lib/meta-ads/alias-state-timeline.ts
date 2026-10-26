export type AliasStateChange = {
  id: string;
  active: boolean;
  createdAt: string;
};
/** Only recorded changes establish historical state; no backfill before the first event or into the future. */
export function aliasStateTimeline(
  since: string,
  until: string,
  baseline: AliasStateChange | null,
  changes: AliasStateChange[],
  asOf: string,
) {
  const start = Date.parse(since + "T00:00:00-05:00"),
    finish = Date.parse(until + "T00:00:00-05:00") + 86400000,
    end = Math.min(finish, Date.parse(asOf));
  const events = [...changes]
    .filter(
      (e) => Date.parse(e.createdAt) >= start && Date.parse(e.createdAt) < end,
    )
    .sort(
      (a, b) =>
        a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
    );
  const segments: { from: string; until: string; active: boolean }[] = [];
  let active: boolean | null = baseline?.active ?? null,
    from = start;
  for (const e of events) {
    const at = Date.parse(e.createdAt);
    if (active !== null && at > from)
      segments.push({
        from: new Date(from).toISOString(),
        until: new Date(at).toISOString(),
        active,
      });
    active = e.active;
    from = at;
  }
  if (active !== null && end > from)
    segments.push({
      from: new Date(from).toISOString(),
      until: new Date(end).toISOString(),
      active,
    });
  const days = [];
  for (let at = start; at < finish; at += 86400000) {
    const parts = segments.flatMap((s) => {
      const left = Math.max(at, Date.parse(s.from)),
        right = Math.min(at + 86400000, Date.parse(s.until));
      return right > left
        ? [
            {
              active: s.active,
              from: new Date(left).toISOString(),
              until: new Date(right).toISOString(),
              offsetHours: (left - at) / 3600000,
              hours: (right - left) / 3600000,
            },
          ]
        : [];
    });
    days.push({
      day: new Date(at - 5 * 3600000).toISOString().slice(0, 10),
      activeHours: parts
        .filter((p) => p.active)
        .reduce((s, p) => s + p.hours, 0),
      inactiveHours: parts
        .filter((p) => !p.active)
        .reduce((s, p) => s + p.hours, 0),
      knownHours: parts.reduce((s, p) => s + p.hours, 0),
      parts,
    });
  }
  return { since, until, asOf, baseline, events, days };
}
