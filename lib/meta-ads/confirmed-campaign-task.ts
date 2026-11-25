import type { InventoryCampaignTask } from "./inventory-sheet-activation";

export function hasConfirmedCampaignDelivery(status: string | null) {
  return !!status && !["UNKNOWN", "UNAVAILABLE", "NOT_RETURNED"].includes(status);
}

export function confirmedCampaignTask(
  task: InventoryCampaignTask,
  active: boolean,
  synchronized?: boolean,
): InventoryCampaignTask {
  if (!active && task === "STOP") return "NONE";
  if (active && task === "SYNC" && synchronized === true) return "NONE";
  if (active && task === "NONE" && synchronized === false) return "SYNC";
  return task;
}
