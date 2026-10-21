export const metricNames: Record<string, string> = {
  MESSAGES: "Conversaciones con mensajes iniciadas",
  LEADS: "Clientes potenciales",
  PURCHASES: "Compras",
  LINK_CLICKS: "Clics en enlaces",
  UNKNOWN: "Resultado no identificado",
};
const types: Record<string, string[]> = {
  MESSAGES: ["onsite_conversion.messaging_conversation_started_7d"],
  LEADS: [
    "lead",
    "onsite_conversion.lead_grouped",
    "offsite_conversion.fb_pixel_lead",
  ],
  PURCHASES: [
    "purchase",
    "omni_purchase",
    "offsite_conversion.fb_pixel_purchase",
  ],
  LINK_CLICKS: ["link_click"],
};
export type Daily = {
  day: string;
  spend: number;
  impressions: number;
  clicks: number;
  actions: Record<string, number>;
};
export function metricFor(
  config: string,
  objective?: string | null,
  goal?: string | null,
) {
  if (config !== "AUTO") return config;
  if (goal === "CONVERSATIONS") return "MESSAGES";
  if (
    goal === "LEAD_GENERATION" ||
    objective === "OUTCOME_LEADS" ||
    objective === "LEAD_GENERATION"
  )
    return "LEADS";
  if (goal === "LINK_CLICKS") return "LINK_CLICKS";
  return "UNKNOWN";
}
export function localDay(timezone: string, now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export function shiftDay(day: string, days: number) {
  const d = new Date(day + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function dayCount(start: string, end: string) {
  return Math.max(
    0,
    Math.round(
      (Date.parse(end + "T12:00:00Z") - Date.parse(start + "T12:00:00Z")) /
        86400000,
    ) + 1,
  );
}
export function summarize(
  rows: Daily[],
  metric: string,
  since: string,
  until: string,
  known: boolean,
) {
  const selected = rows.filter((r) => r.day >= since && r.day <= until);
  let spend = 0,
    results = 0,
    impressions = 0,
    clicks = 0;
  let compatible = metric !== "UNKNOWN";
  for (const row of selected) {
    spend += row.spend;
    impressions += row.impressions;
    clicks += row.clicks;
    const action = types[metric]?.find((t) => Object.hasOwn(row.actions, t));
    if (action) results += row.actions[action];
  }
  const state =
    !known || !compatible
      ? "UNAVAILABLE"
      : results > 0
        ? "RESULTS"
        : spend > 0
          ? "NO_RESULTS"
          : "INACTIVE";
  return {
    since,
    until,
    spend,
    results,
    impressions,
    clicks,
    cost: state === "RESULTS" ? spend / results : null,
    state,
  };
}
export function analyze(
  rows: Daily[],
  metric: string,
  today: string,
  known: boolean,
  historyFrom: string | null,
  target: number | null,
  minResults: number,
) {
  const activity = rows
    .filter((r) => r.spend > 0 || r.impressions > 0)
    .map((r) => r.day)
    .sort();
  const first = activity[0] ?? null,
    last = activity.at(-1) ?? null;
  const since = historyFrom ?? first ?? today;
  const periods = Object.fromEntries(
    [
      ["today", today],
      ["7", shiftDay(today, -6)],
      ["15", shiftDay(today, -14)],
      ["30", shiftDay(today, -29)],
      ["lifetime", since],
    ].map(([key, start]) => [
      key,
      summarize(rows, metric, start, today, known),
    ]),
  );
  const recent = periods["7"],
    previous = summarize(
      rows,
      metric,
      shiftDay(today, -13),
      shiftDay(today, -7),
      known,
    );
  const change =
    recent.cost !== null && previous.cost !== null && previous.cost > 0
      ? (recent.cost / previous.cost - 1) * 100
      : null;
  let rating = "INSUFFICIENT";
  if (recent.results >= minResults && recent.cost !== null) {
    rating =
      target === null
        ? "ENOUGH_DATA"
        : recent.cost <= target
          ? "GOOD"
          : recent.cost > target * 1.5
            ? "CRITICAL"
            : "WATCH";
    if (change !== null && change >= 30 && rating === "GOOD")
      rating = "DETERIORATING";
  } else if (
    target !== null &&
    recent.spend >= target * minResults &&
    recent.results === 0
  )
    rating = "CRITICAL";
  return {
    periods,
    firstDelivery: first,
    lastDelivery: last,
    ageDays: first ? dayCount(first, today) : null,
    activeDays: new Set(activity).size,
    changePercent: change,
    rating,
    historyPartial: true,
  };
}
