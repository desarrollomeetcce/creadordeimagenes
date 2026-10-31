import { periodComparison } from "./period-comparison";
type Person = {
  id: string;
  name: string;
  days: Record<
    string,
    {
      sales: number | null;
      na: boolean;
      partial: boolean;
      financial?: import("./advisor-financial-metrics").AdvisorFinancialDay;
      manualBase?: number | null;
      advisorBase?: number | null;
      status: string | null;
      absence: { hours: number | null; pending: number };
    }
  >;
};
export function advisorTeamRows(people: Person[], basis: "BC" | "BM" | "B") {
  return people.map((p) => {
    const days = Object.values(p.days),
      salesDays = days.filter((d) => !d.na && d.sales !== null),
      baseValue = (d: (typeof days)[number]) =>
        basis === "B"
          ? d.financial?.base
          : basis === "BC"
            ? d.advisorBase
            : d.manualBase,
      baseDays = days.filter(
        (d) => baseValue(d) !== null && baseValue(d) !== undefined,
      ),
      hourDays = days.filter((d) => d.absence.hours !== null),
      attendanceDays = days.filter(
        (d) => d.status === "PRESENT" || d.status === "ABSENT",
      );
    const sales = salesDays.length
        ? salesDays.reduce((n, d) => n + d.sales!, 0)
        : null,
      base = baseDays.length
        ? baseDays.reduce((n, d) => n + baseValue(d)!, 0)
        : null;
    return {
      id: p.id,
      name: p.name,
      sales,
      base,
      percent: periodComparison(
        days.map((d) => ({
          numerator: d.na ? null : d.sales,
          denominator: baseValue(d) ?? null,
        })),
      ).value,
      average: sales === null ? null : sales / salesDays.length,
      knownSales: salesDays.length,
      knownBase: baseDays.length,
      days: days.length,
      partial: days.some(
        (d) =>
          d.partial ||
          (basis === "B" && !!d.financial?.metaPartial) ||
          (!d.na &&
            (d.sales === null ||
              baseValue(d) === null ||
              baseValue(d) === undefined)),
      ),
      present: attendanceDays.length
        ? attendanceDays.filter((d) => d.status === "PRESENT").length
        : null,
      absent: attendanceDays.length
        ? attendanceDays.filter((d) => d.status === "ABSENT").length
        : null,
      hours: hourDays.length
        ? hourDays.reduce((n, d) => n + d.absence.hours!, 0)
        : null,
      pending: days.reduce((n, d) => n + d.absence.pending, 0),
    };
  });
}
