import type { InventoryUsage } from "./inventory-usage";
export type GroupUsageStatus = "USED" | "NEVER";
/** Group organization has two states. Recorded evidence is retained separately for history. */
export function groupUsageStatus(
  cell:
    | {
        automatic: InventoryUsage;
        mode: "AUTO" | "USED" | "UNUSED";
        activationHours?: number | null;
        nextUsedAt?: string | null;
      }
    | undefined,
  now = Date.now(),
): GroupUsageStatus {
  if (!cell) return "NEVER";
  if (cell.mode === "USED") return "USED";
  if (cell.mode === "UNUSED") return "NEVER";
  return cell.automatic === "USED" ||
    (typeof cell.activationHours === "number" &&
      Number.isFinite(cell.activationHours) &&
      cell.activationHours >= 12) ||
    (!!cell.nextUsedAt && Date.parse(cell.nextUsedAt) <= now)
    ? "USED"
    : "NEVER";
}
