export type GroupCountryCampaignState =
  "ACTIVE" | "INACTIVE" | "CREATE" | "STOP" | "FLOW" | "SYNC" | "MIXED" | "NO_RECORD";
export function groupCountryCampaignState(
  observations: { active: boolean | null; task: "NONE" | "CREATE" | "STOP" | "FLOW" | "SYNC" }[],
): GroupCountryCampaignState {
  const states = new Set(
    observations.flatMap((row) =>
      row.task !== "NONE"
        ? [row.task]
        : row.active === null
          ? []
          : [row.active ? "ACTIVE" : "INACTIVE"],
    ),
  );
  return states.size > 1
    ? "MIXED"
    : ((states.values().next().value as
        GroupCountryCampaignState | undefined) ?? "NO_RECORD");
}
export const groupCountryCampaignLabels: Record<
  GroupCountryCampaignState,
  string
> = {
  ACTIVE: "Activado",
  INACTIVE: "Desactivado",
  CREATE: "Por hacer campaña",
  STOP: "Por desactivar",
  FLOW: "Por hacer flujo",
  SYNC: "Por sincronizar",
  MIXED: "Varios estados",
  NO_RECORD: "Sin registro",
};
