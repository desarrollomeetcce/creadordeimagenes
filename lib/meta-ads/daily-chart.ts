export type DailyChartMetric = "cost" | "spend" | "results";
export type DailyChartRow = {
  day: string;
  spend: number | null;
  cost: number | null;
  results: number | null;
};
const dayNumber = (day: string) => Date.parse(day + "T00:00:00Z") / 86400000;
export function dailyChartLayout(
  rows: readonly DailyChartRow[],
  bars: DailyChartMetric,
  line: DailyChartMetric,
  since?: string,
  until?: string,
) {
  const ordered = [...rows].sort((a, b) => a.day.localeCompare(b.day));
  const first = dayNumber(since ?? ordered[0]?.day ?? "2000-01-01"),
    last = dayNumber(until ?? ordered.at(-1)?.day ?? since ?? "2000-01-01");
  const span = Math.max(1, last - first + 1),
    width = Math.max(560, Math.min(span, 730) * 28),
    height = 248,
    top = 12,
    plotHeight = 200;
  const value = (row: DailyChartRow, key: DailyChartMetric) => {
    const v = row[key];
    return v !== null && Number.isFinite(v) && v >= 0 ? v : null;
  };
  const scale = (key: DailyChartMetric) => {
    const maximum = Math.max(0, ...ordered.map((r) => value(r, key) ?? 0));
    if (maximum === 0)
      return {
        max: key === "results" ? 4 : 1,
        ticks: key === "results" ? [4, 3, 2, 1, 0] : [1, 0.75, 0.5, 0.25, 0],
      };
    const rough = maximum / 4,
      unit = 10 ** Math.floor(Math.log10(rough)),
      step =
        key === "results"
          ? Math.max(1, Math.ceil(rough))
          : Math.ceil(rough / unit) * unit,
      max = step * 4;
    return { max, ticks: [max, max * 0.75, max * 0.5, max * 0.25, 0] };
  };
  const left = scale(bars),
    right = scale(line);
  const points = ordered.map((row) => {
    const bar = value(row, bars),
      dot = value(row, line);
    return {
      row,
      x: ((dayNumber(row.day) - first + 0.5) / span) * width,
      bar,
      dot,
      barHeight: bar === null ? null : (bar / left.max) * plotHeight,
      y: dot === null ? null : top + (1 - dot / right.max) * plotHeight,
    };
  });
  const segments: (typeof points)[] = [];
  let current: typeof points = [];
  for (const point of points) {
    const previous = current.at(-1);
    if (
      point.y === null ||
      (previous && dayNumber(point.row.day) - dayNumber(previous.row.day) !== 1)
    ) {
      if (current.length) segments.push(current);
      current = [];
    }
    if (point.y !== null) current.push(point);
  }
  if (current.length) segments.push(current);
  return {
    points,
    segments,
    left,
    right,
    width,
    height,
    top,
    plotHeight,
    barWidth: Math.max(1, (width / span) * 0.64),
  };
}
