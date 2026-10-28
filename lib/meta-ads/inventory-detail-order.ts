export const inventoryDetailOrder = [
  "chart",
  "days",
  "inventory-sales-dates",
  "inventory-advisor-sales",
  "activity",
] as const;
export type InventoryDetailModuleId = (typeof inventoryDetailOrder)[number];
export function normalizeInventoryOrder(
  raw: unknown,
): InventoryDetailModuleId[] {
  const seen = new Set<InventoryDetailModuleId>();
  if (Array.isArray(raw))
    for (const id of raw.slice(0, 50))
      if (inventoryDetailOrder.includes(id as InventoryDetailModuleId))
        seen.add(id as InventoryDetailModuleId);
  return [...seen, ...inventoryDetailOrder.filter((id) => !seen.has(id))];
}
export function moveInventoryModule(
  raw: unknown,
  source: string,
  target: string,
  after = false,
) {
  const order = normalizeInventoryOrder(raw);
  if (
    source === target ||
    !order.includes(source as InventoryDetailModuleId) ||
    !order.includes(target as InventoryDetailModuleId)
  )
    return order;
  const next = order.filter((id) => id !== source),
    index = next.indexOf(target as InventoryDetailModuleId) + (after ? 1 : 0);
  next.splice(index, 0, source as InventoryDetailModuleId);
  return next;
}

export function normalizeDetailOrder(
  raw: unknown,
  defaults: readonly string[],
): string[] {
  const seen = new Set<string>();
  if (Array.isArray(raw))
    for (const id of raw.slice(0, 100))
      if (typeof id === "string" && defaults.includes(id)) seen.add(id);
  return [...seen, ...defaults.filter((id) => !seen.has(id))];
}
export function moveDetailModule(
  raw: unknown,
  source: string,
  target: string,
  after: boolean,
  defaults: readonly string[],
) {
  const order = normalizeDetailOrder(raw, defaults);
  if (source === target || !order.includes(source) || !order.includes(target))
    return order;
  const next = order.filter((id) => id !== source);
  next.splice(next.indexOf(target) + (after ? 1 : 0), 0, source);
  return next;
}
