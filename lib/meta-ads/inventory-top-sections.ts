/** Existing local activation and tasks; never infer or change a Meta campaign. */
export function inventoryTopSection(point: {
  activation: string;
  campaignTasks: readonly string[];
  targets: readonly unknown[];
}): "active" | "inactive" | null {
  if (point.activation === "ACTIVE" || point.activation === "MIXED" || point.campaignTasks.length) return "active";
  return point.activation === "INACTIVE" && point.targets.length > 0 ? "inactive" : null;
}
