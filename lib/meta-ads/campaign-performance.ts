import {
  cacAssessment,
  defaultCacRules,
  type CacRules,
  type CacStatus,
} from "./inventory-cac-policy";
import {
  registeredSalesSummary,
  type RegisteredSalesEntry,
} from "./registered-sales";
export type CampaignSalesPeriod = {
  sales: number | null;
  partial: boolean;
  sharedCampaigns: number;
  linked: boolean;
  since: string;
  until: string;
  cac: number | null;
  effectiveness: number | null;
  provisional: boolean;
  status: CacStatus;
  rulesCurrency: "PEN";
  rules: CacRules;
  statusReason: string;
};
/** Sheet sales are independent of provider results; shared links are never attributed to one campaign. */
export function campaignSalesPeriod(
  entries: RegisteredSalesEntry[],
  since: string,
  until: string,
  spend: number,
  results: number,
  available: boolean,
  sharedCampaigns: number,
  linked: boolean,
  options: { currency?: string; rules?: CacRules } = {},
): CampaignSalesPeriod {
  const summary = registeredSalesSummary(
    entries.filter((r) => r.day >= since && r.day <= until),
    until,
    since,
  );
  const complete =
    summary.total !== null && sharedCampaigns <= 1 && linked && available;
  const assessment = cacAssessment(
    summary.total,
    spend,
    complete && (summary.total !== 0 || !summary.partial),
    options.rules,
  );
  const rules = options.rules ?? defaultCacRules();
  const currency = options.currency ?? "PEN";
  const statusReason = !linked
    ? "Sin vincular"
    : sharedCampaigns > 1
      ? "Ventas compartidas"
      : !available
        ? "Informe Meta pendiente"
        : summary.total === null
          ? "Sin ventas registradas"
          : currency !== "PEN"
            ? "Umbrales en PEN; moneda diferente"
            : summary.partial && summary.total === 0
              ? "Ventas incompletas"
              : summary.partial
                ? "Provisional: faltan días de ventas"
                : "";
  return {
    provisional: complete && summary.partial,
    status: currency === "PEN" ? assessment.status : "PENDING",
    rulesCurrency: "PEN",
    rules,
    statusReason,
    sales: linked ? summary.total : null,
    partial: summary.partial,
    sharedCampaigns,
    linked,
    since,
    until,
    cac: complete && summary.total! > 0 ? spend / summary.total! : null,
    effectiveness:
      complete && results > 0 ? (summary.total! / results) * 100 : null,
  };
}
