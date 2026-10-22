export function reportToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export function shiftDate(day: string, amount: number) {
  const d = new Date(day + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + amount);
  return d.toISOString().slice(0, 10);
}
export function monthDate(day: string, amount = 0) {
  const d = new Date(day + "T12:00:00Z");
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + amount, 1, 12))
    .toISOString()
    .slice(0, 10);
}
export function quickRange(key: string, today: string): [string, string] {
  if (key === "yesterday") return [shiftDate(today, -1), shiftDate(today, -1)];
  if (key === "two") return [shiftDate(today, -1), today];
  if (/^\d+$/.test(key)) return [shiftDate(today, 1 - Number(key)), today];
  const monday = shiftDate(
    today,
    -((new Date(today + "T12:00:00Z").getUTCDay() + 6) % 7),
  );
  if (key === "week") return [monday, today];
  if (key === "lastweek") return [shiftDate(monday, -7), shiftDate(monday, -1)];
  if (key === "month") return [monthDate(today), today];
  if (key === "lastmonth")
    return [monthDate(today, -1), shiftDate(monthDate(today), -1)];
  return [today, today];
}
