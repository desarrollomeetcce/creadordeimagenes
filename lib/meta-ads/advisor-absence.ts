import { z } from "zod";
import { demand } from "../errors";
export const clockPattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
export const absenceIntervalSchema = z
  .object({
    id: z.string().min(1).max(80),
    start: z.string().regex(clockPattern, "Usa HH:mm."),
    end: z.string().regex(clockPattern, "Usa HH:mm.").nullable(),
    nextDay: z.boolean(),
  })
  .strict();
export type AbsenceInterval = z.infer<typeof absenceIntervalSchema>;
const common = {
  advisorId: z.string().min(1).max(80),
  day: z.string().date(),
  revision: z.number().int().nonnegative(),
};
export const advisorAbsenceSchema = z.discriminatedUnion("mode", [
  z
    .object({
      ...common,
      mode: z.literal("MANUAL"),
      hours: z.number().finite().min(0).max(24).multipleOf(0.000001).nullable(),
    })
    .strict(),
  z
    .object({
      ...common,
      mode: z.literal("CLOCK"),
      intervals: z.array(absenceIntervalSchema).max(20),
    })
    .strict(),
]);
export type AbsenceInput = z.infer<typeof advisorAbsenceSchema>;
export const clockMinutes = (clock: string) =>
  Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3));
export function absenceClockSummary(intervals: AbsenceInterval[]) {
  intervals = z.array(absenceIntervalSchema).max(20).parse(intervals);
  demand(
    new Set(intervals.map((i) => i.id)).size === intervals.length,
    "Intervalo repetido.",
  );
  const ordered = intervals
    .map((i) => ({
      ...i,
      startMinute: clockMinutes(i.start),
      endMinute:
        i.end === null ? null : clockMinutes(i.end) + (i.nextDay ? 1440 : 0),
    }))
    .sort((a, b) => a.startMinute - b.startMinute);
  let closed = 0,
    minutes = 0,
    lastEnd = -1;
  const ranges: { start: number; end: number; open: boolean }[] = [];
  for (const [index, i] of ordered.entries()) {
    demand(
      i.endMinute !== null || !i.nextDay,
      "Indica el regreso antes de marcar el día siguiente.",
    );
    demand(
      i.endMinute === null || i.endMinute >= i.startMinute,
      "El regreso es anterior a la salida. Marca día siguiente si corresponde.",
    );
    demand(
      i.endMinute === null || i.endMinute - i.startMinute <= 1440,
      "Una ausencia no puede superar 24 horas.",
    );
    demand(i.startMinute >= lastEnd, "Los horarios de ausencia se superponen.");
    if (i.endMinute === null) {
      demand(
        index === ordered.length - 1,
        "Completa el regreso anterior antes de añadir otra salida.",
      );
      lastEnd = Infinity;
    } else {
      minutes += i.endMinute - i.startMinute;
      closed++;
      lastEnd = i.endMinute;
    }
    ranges.push({
      start: i.startMinute,
      end: i.endMinute ?? i.startMinute + 1440,
      open: i.endMinute === null,
    });
  }
  demand(
    minutes <= 1440,
    "Las horas confirmadas del día no pueden superar 24.",
  );
  return {
    hours: closed ? minutes / 60 : null,
    minutes,
    pending: ordered.filter((i) => i.endMinute === null).length,
    ranges,
  };
}
export function absenceSummary(
  record:
    | {
        mode: string;
        manualHours: unknown;
        intervals: unknown;
        revision: number;
      }
    | null
    | undefined,
) {
  if (!record)
    return {
      mode: "MANUAL" as const,
      manualHours: null as number | null,
      intervals: [] as AbsenceInterval[],
      hours: null as number | null,
      pending: 0,
      revision: 0,
    };
  const intervals = z.array(absenceIntervalSchema).parse(record.intervals);
  const manualHours =
    record.manualHours === null ? null : Number(record.manualHours);
  const summary =
    record.mode === "CLOCK"
      ? absenceClockSummary(intervals)
      : { hours: manualHours, pending: 0 };
  return {
    mode: record.mode as "MANUAL" | "CLOCK",
    manualHours,
    intervals,
    hours: summary.hours,
    pending: summary.pending,
    revision: record.revision,
  };
}
