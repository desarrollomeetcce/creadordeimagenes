export const defaultDetailPeriods = [
  "days:31",
  "days:15",
  "today",
  "month",
  "last-month",
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
  const n = /^days:([1-9]\d{0,3})$/.exec(key)?.[1];
  if (!n || Number(n) > 3660) return null;
  const first = new Date(end.getTime() - (Number(n) - 1) * 86400000);
  return { label: `Últimos ${n} días`, since: date(first), until: today };
}
