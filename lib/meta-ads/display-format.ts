const moneyFormats = new Map<string, Intl.NumberFormat>();
const dayFormats = new Map<string, Intl.DateTimeFormat>();
const dateFormat = new Intl.DateTimeFormat("es-PE", { timeZone: "UTC" });
function remember<T>(map: Map<string, T>, key: string, value: T) {
  if (map.size >= 32) map.delete(map.keys().next().value!);
  map.set(key, value);
  return value;
}
/** Cache presentation objects only, never prices, sales or report responses. */
export function formatMetaMoney(value: number, currency: string) {
  const format =
    moneyFormats.get(currency) ??
    remember(
      moneyFormats,
      currency,
      new Intl.NumberFormat("es-PE", {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
      }),
    );
  return format.format(value);
}
export function formatMetaDate(value: string | null) {
  if (!value) return "No conocida";
  const date = new Date(value.includes("T") ? value : value + "T12:00:00Z");
  return Number.isNaN(date.getTime())
    ? "Invalid Date"
    : dateFormat.format(date);
}
export function localMetaDay(timezone: string, now = new Date()) {
  const format =
    dayFormats.get(timezone) ??
    remember(
      dayFormats,
      timezone,
      new Intl.DateTimeFormat("en-CA", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }),
    );
  return format.format(now);
}
