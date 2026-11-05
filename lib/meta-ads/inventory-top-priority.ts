import type { InventorySheetActivationReport } from "./inventory-sheet-activation";
export function inventoryTopPriority(
  point: InventorySheetActivationReport["rows"][number],
  source: "budget" | "meta" = "budget",
) {
  const rank = point.campaignTasks.includes("STOP")
    ? 2
    : point.campaignTasks.includes("CREATE")
      ? 1
      : 0;
  return (
    rank * 10 +
    { CRITICAL: 0, SEVERE: 1, ALERT: 2, TESTING: 3, WITHIN: 4, PENDING: 5 }[
      source === "meta"
        ? (point.cac?.meta.assessment.status ?? "PENDING")
        : (point.cac?.[source].assessment ?? point.assessment).status
    ]
  );
}
