/** Rendering windows only; API date ranges and totals keep the complete selection. */
export function reportDayPage(length: number, requested: number, size = 31) {
  const limit = Number.isInteger(size) ? Math.max(1, Math.min(366, size)) : 31;
  const pages = Math.max(1, Math.ceil(length / limit));
  const page = Math.max(
    0,
    Math.min(Number.isInteger(requested) ? requested : 0, pages - 1),
  );
  return { page, pages, start: page * limit, end: (page + 1) * limit };
}
export function previousMonthStart(today: string) {
  const d = new Date(today + "T12:00:00Z");
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1))
    .toISOString()
    .slice(0, 10);
}
/** An old import should not trigger years of unrelated reads; recent history includes today. */
export function importTotalsUntil(sourceUntil: string, today: string) {
  const gap = (Date.parse(today) - Date.parse(sourceUntil)) / 86400000;
  return gap >= 0 && gap <= 31 ? today : sourceUntil;
}
