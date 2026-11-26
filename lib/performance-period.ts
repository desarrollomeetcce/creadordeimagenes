export function performancePeriod(from: unknown, to: unknown) {
  const date = (value: unknown): value is string => {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const time = Date.parse(value);
    return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
  };
  if (!date(from) || !date(to) || from > to || Date.parse(to) - Date.parse(from) >= 31 * 86400000)
    return null;
  return { from, to };
}

export function withPerformancePeriod(href: string, period: ReturnType<typeof performancePeriod>) {
  if (!period) return href;
  return href + (href.includes("?") ? "&" : "?") + new URLSearchParams({ from: period.from, to: period.to });
}
