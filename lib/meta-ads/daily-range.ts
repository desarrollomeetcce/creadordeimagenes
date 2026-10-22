import { demand } from "../errors";
import { shiftDay } from "./analytics";
const validDay = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value + "T12:00:00Z")) &&
  new Date(value + "T12:00:00Z").toISOString().slice(0, 10) === value;
export function dailyRange(params: URLSearchParams, today: string) {
  const since = params.get("since"),
    until = params.get("until"),
    all = params.get("all");
  demand(!all || all === "1", "Selección de histórico diario inválida.");
  demand(
    !all || (!since && !until),
    "Elige un rango o todo el histórico diario.",
  );
  if (all) return { lte: today };
  if (since === null && until === null)
    return { gte: shiftDay(today, -29), lte: today };
  demand(
    since &&
      until &&
      validDay(since) &&
      validDay(until) &&
      since <= until &&
      until <= today,
    "Selecciona fechas válidas, desde el inicio hasta el final del periodo, sin días futuros.",
  );
  return { gte: since, lte: until };
}
