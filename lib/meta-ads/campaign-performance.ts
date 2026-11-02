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
): CampaignSalesPeriod {
  const summary = registeredSalesSummary(
    entries.filter((r) => r.day >= since && r.day <= until),
    until,
    since,
  );
  const complete =
    summary.total !== null &&
    !summary.partial &&
    sharedCampaigns <= 1 &&
    linked &&
    available;
  return {
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
