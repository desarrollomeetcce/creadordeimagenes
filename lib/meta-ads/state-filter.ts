export const deliveryFilters = [
  { id: "active", label: "Activados" },
  { id: "paused", label: "Desactivados" },
  { id: "delivery", label: "Con entrega" },
  { id: "effective", label: "Efectivos" },
] as const;
export type DeliveryFilter = (typeof deliveryFilters)[number]["id"];
export function parseDeliveryFilters(raw: string): DeliveryFilter[] | null {
  if (raw === "all" || raw === "") return [];
  if (raw.length > 80) return null;
  const values = raw.split(",");
  if (
    values.length > 4 ||
    !values.every((v) => deliveryFilters.some((f) => f.id === v)) ||
    (values.includes("active") && values.includes("paused"))
  )
    return null;
  return deliveryFilters.filter((f) => values.includes(f.id)).map((f) => f.id);
}
export function encodeDeliveryFilters(values: readonly DeliveryFilter[]) {
  return (
    deliveryFilters
      .filter((f) => values.includes(f.id))
      .map((f) => f.id)
      .join(",") || "all"
  );
}
export function toggleDeliveryFilter(
  values: readonly DeliveryFilter[],
  value: DeliveryFilter,
): DeliveryFilter[] {
  if (values.includes(value)) return values.filter((v) => v !== value);
  const opposite =
    value === "active" ? "paused" : value === "paused" ? "active" : null;
  return [...values.filter((v) => v !== opposite), value];
}
