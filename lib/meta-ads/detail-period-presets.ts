import { calendarPresets, presetRange } from "./calendar-presets";
export const defaultDetailPeriods = [
  "days:31",
  "days:15",
  "today",
  "month",
  "last-month",
];
export const totalDetailPeriods = [
  "today",
  "calendar:yesterday",
  "days:15",
  "days:30",
  "month",
];
export function detailPeriodPreset(key: string, today: string) {
  const end = new Date(today + "T12:00:00Z");
  if (!Number.isFinite(end.getTime())) return null;
  const date = (v: Date) => v.toISOString().slice(0, 10);
  if (key === "today") return { label: "Hoy", since: today, until: today };
  if (key === "month")
    return { label: "Este mes", since: today.slice(0, 8) + "01", until: today };
  if (key === "last-month") {
    const first = new Date(
      Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 1, 1, 12),
    );
    const last = new Date(
      Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 0, 12),
    );
    return { label: "Mes anterior", since: date(first), until: date(last) };
  }
  if (key.startsWith("calendar:")) {
    const name = key.slice(9),
      range = presetRange(name, today),
      label = calendarPresets.find(([id]) => id === name)?.[1];
    return range && label ? { label, since: range[0], until: range[1] } : null;
  }
  if (key.startsWith("range:")) {
    const parts = /^range:(\d{4}-\d{2}-\d{2}):(\d{4}-\d{2}-\d{2})$/.exec(key);
    if (!parts) return null;
    const [, since, until] = parts;
    const valid = (d: string) =>
      Number.isFinite(Date.parse(d)) &&
      new Date(d + "T12:00:00Z").toISOString().slice(0, 10) === d;
    if (
      !valid(since) ||
      !valid(until) ||
      since > until ||
      until > today ||
      (Date.parse(until) - Date.parse(since)) / 86400000 >= 3660
    )
      return null;
    const human = (d: string) =>
      d.slice(8) + "/" + d.slice(5, 7) + "/" + d.slice(0, 4);
    return { label: human(since) + " — " + human(until), since, until };
  }
  const n = /^days:([1-9]\d{0,3})$/.exec(key)?.[1];
  if (!n || Number(n) > 3660) return null;
  const first = new Date(end.getTime() - (Number(n) - 1) * 86400000);
  return { label: `Últimos ${n} días`, since: date(first), until: today };
}

/** Meta shortcuts remain relative; a custom calendar selection keeps its exact dates. */
export function savedCalendarPeriod(
  since: string,
  until: string,
  preset: string | undefined,
  today: string,
) {
  const key =
    preset === "today" || preset === "month" || preset === "last-month"
      ? preset
      : preset && /^[1-9]\d*$/.test(preset)
        ? "days:" + preset
        : preset && preset !== "custom"
          ? "calendar:" + preset
          : `range:${since}:${until}`;
  const parsed = detailPeriodPreset(key, today);
  return parsed && parsed.since === since && parsed.until === until
    ? key
    : null;
}
