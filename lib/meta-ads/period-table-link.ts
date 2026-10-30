import { isCountryCode } from "./countries";
export type PeriodTableLink = {
  tableId: string;
  aliasId: string;
  country: string;
  since: string;
  until: string;
  focus?: boolean;
};
export function periodTableUrl(period: PeriodTableLink) {
  return (
    "/?" +
    new URLSearchParams({
      view: "products",
      periodTable: period.tableId,
      periodAlias: period.aliasId,
      periodCountry: period.country,
      periodSince: period.since,
      periodUntil: period.until,
      ...(period.focus ? { periodFocus: "1" } : {}),
    })
  );
}
export function parsePeriodTableLink(
  params: URLSearchParams,
): PeriodTableLink | null {
  const tableId = params.get("periodTable") ?? "",
    aliasId = params.get("periodAlias") ?? "",
    country = params.get("periodCountry") ?? "",
    since = params.get("periodSince") ?? "",
    until = params.get("periodUntil") ?? "";
  const day = (s: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    Number.isFinite(Date.parse(s)) &&
    new Date(s + "T12:00:00Z").toISOString().slice(0, 10) === s;
  if (
    !tableId ||
    tableId.length > 100 ||
    aliasId.length > 100 ||
    (country && !isCountryCode(country)) ||
    !day(since) ||
    !day(until) ||
    since > until ||
    (Date.parse(until) - Date.parse(since)) / 86400000 >= 3660
  )
    return null;
  return {
    tableId,
    aliasId,
    country,
    since,
    until,
    ...(params.get("periodFocus") === "1" ? { focus: true } : {}),
  };
}
