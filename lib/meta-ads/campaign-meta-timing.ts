export type MetaTimingSource = "scheduled" | "created" | "reporting";
export type CampaignMetaTiming = {
  start: string | null;
  day: string | null;
  days: number | null;
  source: MetaTimingSource | null;
  campaigns: number;
};
/** Cached provider starts are distinct from local activation. Creation/first saved reports are explicitly estimates, never proof of reactivation. */
export function campaignMetaTiming(
  campaigns: {
    id: string;
    scheduledStart?: Date | string | null;
    createdTime?: Date | string | null;
    firstReport?: string | null;
  }[],
  asOf: string,
  timezone = "America/Lima",
): CampaignMetaTiming {
  const instant = (v: Date | string | null | undefined) =>
    v && Number.isFinite(new Date(v).getTime())
      ? new Date(v).toISOString()
      : null;
  const rows = campaigns
    .flatMap((c) => {
      const scheduled = instant(c.scheduledStart),
        created = instant(c.createdTime),
        reporting = instant(
          c.firstReport ? c.firstReport + "T12:00:00Z" : null,
        );
      const start = scheduled ?? created ?? reporting;
      return start
        ? [
            {
              start,
              source: scheduled
                ? ("scheduled" as const)
                : created
                  ? ("created" as const)
                  : ("reporting" as const),
            },
          ]
        : [];
    })
    .sort((a, b) => b.start.localeCompare(a.start));
  const latest = rows[0];
  if (!latest)
    return {
      start: null,
      day: null,
      days: null,
      source: null,
      campaigns: campaigns.length,
    };
  const day = (v: string) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(v));
  const first = day(latest.start),
    today = day(asOf);
  return {
    ...latest,
    day: first,
    days: Math.max(
      0,
      Math.floor((Date.parse(today) - Date.parse(first)) / 86400000) + 1,
    ),
    campaigns: campaigns.length,
  };
}
