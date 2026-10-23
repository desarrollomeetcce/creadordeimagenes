import { dayCount, shiftDay } from "./analytics";
export type TrendDay = {
  day: string;
  spend: number;
  results: number | null;
  impressions?: number;
  clicks?: number;
};
export const trendDefaults = {
  window: 7,
  minimumDays: 3,
  minimumResults: 10,
  materialChange: 0.2,
  persistenceChange: 0.1,
  samples: 1200,
};
export function dailyTrend(
  input: readonly TrendDay[],
  since: string,
  until: string,
  today: string,
  config = trendDefaults,
) {
  // Closed local days only. Never move the endpoint backwards to hide missing recent data.
  const end = until < today ? until : shiftDay(today, -1);
  const days = dayCount(since, end),
    window = Math.min(config.window, Math.floor(days / 2));
  const valid = (r: TrendDay) =>
    /^\d{4}-\d{2}-\d{2}$/.test(r.day) &&
    Number.isFinite(r.spend) &&
    r.spend >= 0 &&
    r.results !== null &&
    Number.isFinite(r.results) &&
    r.results >= 0;
  const counts = new Map<string, number>();
  for (const r of input) counts.set(r.day, (counts.get(r.day) ?? 0) + 1);
  const rows = input
    .filter(
      (r) =>
        valid(r) && counts.get(r.day) === 1 && r.day >= since && r.day <= end,
    )
    .sort((a, b) => a.day.localeCompare(b.day));
  const recentStart = shiftDay(end, 1 - window),
    previousEnd = shiftDay(recentStart, -1),
    previousStart = shiftDay(recentStart, -window);
  const summarize = (start: string, finish: string) => {
    const selected = rows.filter((r) => r.day >= start && r.day <= finish);
    const spend = selected.reduce((s, r) => s + r.spend, 0),
      results = selected.reduce((s, r) => s + r.results!, 0),
      impressions = selected.reduce((s, r) => s + (r.impressions ?? 0), 0),
      clicks = selected.reduce((s, r) => s + (r.clicks ?? 0), 0);
    return {
      start,
      end: finish,
      days: selected.length,
      expected: dayCount(start, finish),
      activeDays: selected.filter((r) => r.spend > 0).length,
      spend,
      results,
      cost: results > 0 ? spend / results : null,
      perDay: selected.length ? results / selected.length : null,
      impressions,
      clicks,
      ctr: impressions > 0 ? clicks / impressions : null,
    };
  };
  const previous = summarize(previousStart, previousEnd),
    recent = summarize(recentStart, end),
    historical = summarize(since, previousEnd);
  const change =
    previous.cost !== null && previous.cost > 0 && recent.cost !== null
      ? recent.cost / previous.cost - 1
      : null;
  const resultChange =
    previous.perDay && recent.perDay !== null
      ? recent.perDay / previous.perDay - 1
      : null;
  const spendChange =
    previous.spend > 0 ? recent.spend / previous.spend - 1 : null;
  const complete =
    window > 0 && previous.days === window && recent.days === window;
  const enough =
    complete &&
    window >= config.minimumDays &&
    previous.activeDays >= config.minimumDays &&
    recent.activeDays >= config.minimumDays &&
    previous.results >= config.minimumResults &&
    recent.results >= config.minimumResults &&
    previous.spend > 0 &&
    recent.spend > 0;
  let interval: [number, number] | null = null;
  // Paired circular moving-block bootstrap: same day positions in both windows,
  // adjacent blocks of two preserve some serial dependence. Deterministic seed.
  if (enough) {
    const old = rows.filter(
        (r) => r.day >= previousStart && r.day <= previousEnd,
      ),
      latest = rows.filter((r) => r.day >= recentStart && r.day <= end);
    let seed = 0x51f15e;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const ratios: number[] = [];
    for (let sample = 0; sample < config.samples; sample++) {
      let aSpend = 0,
        aResults = 0,
        bSpend = 0,
        bResults = 0;
      for (let n = 0; n < window;) {
        const start = Math.floor(random() * window);
        for (let offset = 0; offset < 2 && n < window; offset++, n++) {
          const j = (start + offset) % window;
          aSpend += old[j].spend;
          aResults += old[j].results!;
          bSpend += latest[j].spend;
          bResults += latest[j].results!;
        }
      }
      // Undefined ratios invalidate inference, rather than silently discarding them.
      ratios.push(
        aResults > 0 && aSpend > 0 && bResults > 0
          ? bSpend / bResults / (aSpend / aResults)
          : Infinity,
      );
    }
    ratios.sort((a, b) => a - b);
    const lo = ratios[Math.floor((ratios.length - 1) * 0.025)],
      hi = ratios[Math.ceil((ratios.length - 1) * 0.975)];
    if (Number.isFinite(lo) && Number.isFinite(hi) && change !== null) {
      // Do not report zero uncertainty for identical daily costs: include count noise
      // under a working Poisson rate model (fixed spend exposure), conservatively
      // enveloped with the block bootstrap to retain observed day-to-day variation.
      const se = Math.sqrt(1 / previous.results + 1 / recent.results);
      const ratio = 1 + change;
      interval = [
        Math.min(lo, ratio * Math.exp(-1.96 * se)) - 1,
        Math.max(hi, ratio * Math.exp(1.96 * se)) - 1,
      ];
    }
  }
  const split = shiftDay(recentStart, Math.floor(window / 2));
  const halves = [
    summarize(recentStart, shiftDay(split, -1)),
    summarize(split, end),
  ];
  const previousSplit = shiftDay(previousStart, Math.floor(window / 2));
  const previousHalves = [
    summarize(previousStart, shiftDay(previousSplit, -1)),
    summarize(previousSplit, previousEnd),
  ];
  const persistence = (direction: number) =>
    halves.every((h, i) => {
      const baseline = previousHalves[i];
      return (
        h.results >= 3 &&
        baseline.results >= 3 &&
        h.cost !== null &&
        baseline.cost !== null &&
        baseline.cost > 0 &&
        direction * (h.cost / baseline.cost - 1) >= config.persistenceChange
      );
    });
  let status:
    | "improving"
    | "deteriorating"
    | "stable"
    | "mixed"
    | "observing"
    | "partial"
    | "no-results"
    | "no-spend" = "observing";
  if (window < config.minimumDays) status = "observing";
  else if (!complete) status = "partial";
  else if (recent.spend === 0) status = "no-spend";
  else if (recent.results === 0) status = "no-results";
  else if (enough && interval && change !== null) {
    if (change >= config.materialChange && interval[0] > 0 && persistence(1))
      status = "deteriorating";
    else if (
      change <= -config.materialChange &&
      interval[1] < 0 &&
      persistence(-1)
    )
      status = "improving";
    else if (
      Math.abs(change) <= 0.1 &&
      interval[0] >= -0.2 &&
      interval[1] <= 0.2
    )
      status = "stable";
    else status = "mixed";
  }
  return {
    status,
    window,
    end,
    previous,
    recent,
    historical,
    change,
    resultChange,
    spendChange,
    interval,
    complete,
    enough,
    weekdaysMatched: window === 7,
    excludedToday: until >= today,
    config,
  };
}
