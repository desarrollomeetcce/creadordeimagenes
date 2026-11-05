import { categoryKey } from "./category-paste";
import { countryName } from "./countries";
export type InventoryDetailDestination = {
  aliasId: string;
  tableId: string;
  country: string;
  label: string;
};
export const inventoryDetailDestinationKey = (
  d: Pick<InventoryDetailDestination, "aliasId" | "tableId" | "country">,
) => JSON.stringify([d.tableId, d.aliasId, d.country]);
/** Resolve only aliases already present in this inventory row; ambiguous names never select an arbitrary diploma. */
export function inventoryDetailDestinations(
  name: string,
  aliases: { id: string; name: string; tableId: string; standalone: boolean }[],
  columns: { tableId: string; country: string; name: string }[],
): InventoryDetailDestination[] {
  const result: InventoryDetailDestination[] = [];
  for (const column of columns) {
    if (!column.country) continue;
    const matches = aliases.filter(
      (a) =>
        !a.standalone &&
        a.tableId === column.tableId &&
        categoryKey(a.name) === categoryKey(name),
    );
    const exact = matches.filter((a) => a.name === name);
    const alias =
      exact.length === 1
        ? exact[0]
        : matches.length === 1
          ? matches[0]
          : undefined;
    if (!alias) continue;
    result.push({
      aliasId: alias.id,
      tableId: column.tableId,
      country: column.country,
      label: `${countryName(column.country)} (${column.country}) · ${column.name}`,
    });
  }
  return [
    ...new Map(
      result.map((d) => [inventoryDetailDestinationKey(d), d]),
    ).values(),
  ].sort((a, b) => a.label.localeCompare(b.label, "es"));
}
