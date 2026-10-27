import {
  sumEffectivenessDay,
  type TotalValue,
} from "./effectiveness-total-values";
import type { PeriodCell } from "./period-summary";
export type InventoryBaseContext = {
  scope: "INVENTORY_COUNTRY";
  days: Record<string, TotalValue>;
};
/** Context of the selected items/countries, independent of any sales person's identity. */
export function inventoryBaseContext(
  rows: { days: Record<string, PeriodCell>; campaigns: number }[],
  dates: string[],
): InventoryBaseContext {
  return {
    scope: "INVENTORY_COUNTRY",
    days: Object.fromEntries(
      dates.map((day) => [day, sumEffectivenessDay(rows, day).base]),
    ),
  };
}
