import type { InventoryCampaignTask } from "./inventory-sheet-activation";

/** A confirmed stop completes only the pause task; other work remains pending. */
export function confirmedCampaignTask(
  task: InventoryCampaignTask,
  active: boolean,
): InventoryCampaignTask {
  return !active && task === "STOP" ? "NONE" : task;
}
