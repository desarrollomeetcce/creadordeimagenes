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
