export const calendarPresets = [
  ["today", "Hoy"],
  ["yesterday", "Ayer"],
  ["today-yesterday", "Hoy y ayer"],
  ["7", "Últimos 7 días"],
  ["14", "Últimos 14 días"],
  ["28", "Últimos 28 días"],
  ["30", "Últimos 30 días"],
  ["week", "Esta semana"],
  ["last-week", "La semana pasada"],
  ["month", "Este mes"],
  ["last-month", "El mes pasado"],
] as const;
export function shiftCalendarDay(day: string, n: number) {
  const d = new Date(day + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function presetRange(
  key: string,
  today: string,
): [string, string] | null {
  const first = today.slice(0, 7) + "-01",
    monday = shiftCalendarDay(
      today,
      -((new Date(today + "T12:00:00Z").getUTCDay() + 6) % 7),
    );
  if (key === "today") return [today, today];
  if (key === "yesterday")
    return [shiftCalendarDay(today, -1), shiftCalendarDay(today, -1)];
  if (key === "today-yesterday") return [shiftCalendarDay(today, -1), today];
  if (["7", "14", "28", "30"].includes(key))
    return [shiftCalendarDay(today, 1 - Number(key)), today];
  if (key === "week") return [monday, today];
  if (key === "last-week")
    return [shiftCalendarDay(monday, -7), shiftCalendarDay(monday, -1)];
  if (key === "month") return [first, today];
  if (key === "last-month") {
    const last = shiftCalendarDay(first, -1);
    return [last.slice(0, 7) + "-01", last];
  }
  return null;
}
