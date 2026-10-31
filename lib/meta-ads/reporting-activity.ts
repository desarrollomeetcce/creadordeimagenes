import { activePeriods, type ActivePeriod } from "./active-periods";
import type { EffectivenessRow } from "./effectiveness";
/** Reads only: manual historical dates bridge missing activation history; imported Meta never does. */
export function reportingActivity(
  days: EffectivenessRow["days"],
  events: { id: string; active: boolean; createdAt: string }[],
  asOf: string,
) {
  const today = new Date(Date.parse(asOf) - 18000000)
    .toISOString()
    .slice(0, 10);
  const recorded = Object.keys(days)
    .filter(
      (day) =>
        day <= today &&
        ((typeof days[day]?.budget === "number" &&
          !days[day].na.includes("budget")) ||
          (typeof days[day]?.sales === "number" &&
            !days[day].na.includes("sales"))),
    )
    .sort();
  const ordered = [...events]
    .filter((e) => Date.parse(e.createdAt) <= Date.parse(asOf))
    .sort(
      (a, b) =>
        Date.parse(a.createdAt) - Date.parse(b.createdAt) ||
        a.id.localeCompare(b.id),
    );
  const firstObserved = ordered[0]
    ? Date.parse(ordered[0].createdAt)
    : Date.parse(asOf);
  const historical: ActivePeriod[] = recorded.flatMap((day) => {
    const from = Date.parse(day + "T00:00:00-05:00");
    if (from >= firstObserved) return [];
    const end = Math.min(from + 86400000, firstObserved, Date.parse(asOf));
    return end > from
      ? [
          {
            id: "registration:" + day,
            from: new Date(from).toISOString(),
            until: new Date(end).toISOString(),
            since: day,
            through: day,
          },
        ]
      : [];
  });
  const joined: ActivePeriod[] = [];
  for (const p of historical) {
    const previous = joined.at(-1);
    if (previous?.until === p.from) {
      previous.until = p.until;
      previous.through = p.through;
    } else joined.push({ ...p });
  }
  const periods = [...activePeriods(ordered, asOf), ...joined]
    .filter((p) => Date.parse(p.until ?? asOf) > Date.parse(p.from))
    .sort((a, b) => Date.parse(b.from) - Date.parse(a.from));
  return {
    firstRegistration: recorded[0] ?? null,
    inferred: historical.length > 0,
    periods,
    since: periods.at(-1)?.since ?? null,
    currentSince: periods[0]?.since ?? null,
  };
}
