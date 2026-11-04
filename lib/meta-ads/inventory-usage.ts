export type InventoryUsage = "NEVER" | "TEST" | "USED" | "UNKNOWN";
/** Uses recorded intervals, including closed periods; unknown starts are never called unused. */
export function inventoryUsage(
  periods: { since: string | null; until: string | null }[],
  now = Date.now(),
): { usage: InventoryUsage; activationHours: number | null } {
  if (!periods.length) return { usage: "NEVER", activationHours: 0 };
  if (periods.some((p) => !p.since))
    return { usage: "UNKNOWN", activationHours: null };
  const milliseconds = periods.map(
    (p) => (p.until ? Date.parse(p.until) : now) - Date.parse(p.since!),
  );
  if (milliseconds.some((n) => !Number.isFinite(n) || n < 0))
    return { usage: "UNKNOWN", activationHours: null };
  const activationHours = milliseconds.reduce((sum, n) => sum + n, 0) / 3600000;
  return { usage: activationHours < 12 ? "TEST" : "USED", activationHours };
}

export function inventoryActivationPeriods(
  events: { active: boolean; createdAt: Date; snapshot: unknown }[],
  active: boolean,
) {
  const result: {
    since: string | null;
    until: string | null;
    inferred?: boolean;
  }[] = [];
  let start: string | null = null,
    on = events.length
      ? (((events[0].snapshot as Record<string, unknown>)?.priorActive as
          boolean | undefined) ?? !events[0].active)
      : active;
  for (const e of events) {
    if (e.active === on) continue;
    const time = e.createdAt.toISOString();
    if (e.active) start = time;
    else result.push({ since: start, until: time });
    on = e.active;
  }
  if (on) result.push({ since: start, until: null });
  return result.reverse();
}

/** Merge overlapping aliases so simultaneous campaigns do not double activation time. */
export function inventoryCountryUsage(
  states: {
    active: boolean;
    events: { active: boolean; createdAt: Date; snapshot: unknown }[];
  }[],
  now = Date.now(),
) {
  const periods = states.flatMap((s) =>
    inventoryActivationPeriods(s.events, s.active),
  );
  const unknown = periods.some((p) => !p.since);
  const ranges = periods
    .filter((p) => p.since)
    .map((p) => [Date.parse(p.since!), p.until ? Date.parse(p.until) : now])
    .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b >= a)
    .sort((a, b) => a[0] - b[0]);
  const merged: number[][] = [];
  for (const range of ranges) {
    const last = merged.at(-1);
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else merged.push([...range]);
  }
  const hours = merged.reduce((sum, [a, b]) => sum + b - a, 0) / 3600000;
  return {
    nextUsedAt:
      !unknown && hours < 12 && periods.some((p) => p.since && !p.until)
        ? new Date(now + (12 - hours) * 3600000).toISOString()
        : null,
    usage:
      hours >= 12
        ? ("USED" as const)
        : unknown
          ? ("UNKNOWN" as const)
          : hours > 0
            ? ("TEST" as const)
            : ("NEVER" as const),
    activationHours: unknown && hours < 12 ? null : hours,
  };
}
