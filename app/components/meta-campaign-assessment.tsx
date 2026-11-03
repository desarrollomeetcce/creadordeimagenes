import { isRecentCampaignPeriod } from "../../lib/meta-ads/campaign-evaluation-window";
import type { CampaignSalesPeriod } from "../../lib/meta-ads/campaign-performance";
import {
  cacStatusNames,
  defaultCacRules,
} from "../../lib/meta-ads/inventory-cac-policy";
export function MetaCampaignAssessment({
  value,
  compact = false,
  today,
}: {
  value?: CampaignSalesPeriod | null;
  compact?: boolean;
  today?: string;
}) {
  const historical = value && today && !isRecentCampaignPeriod(value, today);
  const status = value?.status ?? "PENDING";
  const rules = value?.rules ?? defaultCacRules();
  const label =
    status === "PENDING" && value?.statusReason
      ? value.statusReason
      : cacStatusNames[status];
  return (
    <span
      className={"meta-cac-status meta-cac-status-" + status}
      title={
        value
          ? `${value.since} — ${value.until}. CAC = gasto Meta / ventas registradas. Efectividad = ventas / resultados Meta × 100. Límites PEN: revisar ${rules.review}, grave ${rules.severe}, crítico ${rules.critical}; sin ventas, revisar desde ${rules.zero}. ${value.statusReason}${value.provisional ? ". Cálculo provisional con las ventas registradas; puede cambiar al completar los días faltantes." : ""}`
          : "Datos pendientes"
      }
    >
      <span
        className={"inventory-status-dot inventory-status-dot-" + status}
        aria-hidden="true"
      />
      {label}
      {historical ? " · histórico" : ""}
      {value?.provisional && status !== "PENDING"
        ? compact
          ? "*"
          : " · provisional"
        : ""}
    </span>
  );
}
