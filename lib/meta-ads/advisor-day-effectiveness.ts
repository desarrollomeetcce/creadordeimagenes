/** A daily ratio uses sales and its base from the same business date. BM is eligible only after that day closes in Lima. */
export function advisorDayEffectiveness(b: {
  day: string;
  today: string;
  basis: "BC" | "BM";
  sales: number | null;
  base: number | null | undefined;
  na?: boolean;
  partial?: boolean;
}) {
  if (b.day > b.today || (b.basis === "BM" && b.day === b.today))
    return {
      value: null,
      reason: "Disponible cuando termine el día completo.",
    };
  if (b.na) return { value: null, reason: "Ventas no aplicables." };
  if (b.sales === null || b.base === null || b.base === undefined)
    return { value: null, reason: "Faltan ventas o base de esta misma fecha." };
  if (b.partial && b.basis === "BM")
    return {
      value: null,
      reason: "Los datos de esta fecha están incompletos.",
    };
  if (!Number.isFinite(b.sales) || !Number.isFinite(b.base) || b.base <= 0)
    return {
      value: null,
      reason:
        "Se necesita una base mayor que cero para calcular el porcentaje.",
    };
  return {
    value: b.sales / b.base,
    reason: `Ventas / ${b.basis} de esta misma fecha.${b.partial ? " Avance provisional con registros parciales." : ""}`,
  };
}
