import { matchesSearchWords } from "../search";
export type AccountActivity = {
  partial?: boolean;
  state: "READY" | "UNSYNCED" | "SYNCING" | "STALE";
  spend30: number | null;
  activeCampaigns: number | null;
};
export type SearchableAccount = {
  id: string;
  name: string;
  businessId?: string | null;
  businessName?: string | null;
  currency: string;
  enabled: boolean;
  activity?: AccountActivity;
};
export const activityOptions = [
  ["all", "Toda la actividad"],
  ["spend", "Con gasto · últimos 30 días"],
  ["active", "Con campañas activas"],
  ["none", "Sin gasto ni campañas activas"],
  ["unknown", "Sin datos actuales / sin sincronizar"],
] as const;
export function matchesAccount(
  a: SearchableAccount,
  query = "",
  activity = "all",
  business = "",
) {
  if (
    !matchesSearchWords(
      `${a.name} ${a.id} ${a.businessName ?? ""}`,
      query.replace(/\bact_/gi, ""),
    )
  )
    return false;
  if (
    business === "__unknown"
      ? !!a.businessId
      : business && a.businessId !== business
  )
    return false;
  if (activity === "enabled") return a.enabled;
  if (activity === "unknown")
    return (
      !a.activity ||
      a.activity.state !== "READY" ||
      (!!a.activity.partial && !a.activity.activeCampaigns)
    );
  if (activity !== "all") {
    if (a.activity?.state !== "READY") return false;
    if (activity === "spend")
      return a.activity.spend30 !== null && a.activity.spend30 > 0;
    if (activity === "active")
      return (
        a.activity.activeCampaigns !== null && a.activity.activeCampaigns > 0
      );
    if (activity === "none")
      return (
        !a.activity.partial &&
        a.activity.spend30 === 0 &&
        a.activity.activeCampaigns === 0
      );
  }
  return true;
}
export function accountActivityText(a: SearchableAccount) {
  if (!a.activity || a.activity.state === "UNSYNCED")
    return "Sin sincronizar · actividad desconocida";
  if (a.activity.state === "SYNCING")
    return "Importación en curso · actividad aún no confirmada";
  if (a.activity.state === "STALE")
    return "Datos atrasados · sincroniza para confirmar actividad";
  return `${a.activity.activeCampaigns ?? "—"} campañas activas${a.activity.partial ? " con actividad importada (inventario parcial)" : ""} · gasto 30 días: ${a.currency} ${a.activity.spend30?.toFixed(2) ?? "—"}`;
}
