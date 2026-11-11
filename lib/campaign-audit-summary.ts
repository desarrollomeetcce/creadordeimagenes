import {
  campaignDisplayName,
  type CampaignConfig,
  type CampaignItem,
} from "./creative-studio/campaign-policy";
import { countryName, isCountryCode } from "./meta-ads/countries";
import { metaObjectURL } from "./meta-ads/meta-link";
export type CampaignAuditLaunch = {
  id: string;
  accountId: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  config: Record<string, any>;
  items: unknown;
  steps: unknown;
};
export function campaignAuditRows(launch: CampaignAuditLaunch) {
  const items = Array.isArray(launch.items) ? launch.items : [];
  const steps = Array.isArray(launch.steps) ? launch.steps : [];
  const config = launch.config ?? {};
  const country =
    typeof config.country === "string" && isCountryCode(config.country)
      ? config.country
      : "";
  const result = new Map<
    string,
    {
      key: string;
      name: string;
      country: string;
      countryName: string;
      campaignId: string;
      accountId: string;
      createdAt: Date | string;
      completedAt: Date | string;
      adsets: Set<string>;
      ads: Set<string>;
      href: string | null;
    }
  >();
  for (const step of steps) {
    if (
      step?.kind !== "CAMPAIGN" ||
      step.state !== "DONE" ||
      !/^\d{1,40}$/.test(String(step.id ?? "")) ||
      !Number.isInteger(step.campaign) ||
      !items[step.campaign]
    )
      continue;
    const id = String(step.id);
    const item = items[step.campaign];
    let row = result.get(id);
    if (!row) {
      const name = step.existing
        ? typeof config.existingCampaign?.name === "string" &&
          config.existingCampaign.name.trim()
          ? config.existingCampaign.name
          : "Campaña existente"
        : campaignDisplayName(
            {
              name: String(item.name ?? ""),
              subproductId: "",
              variationIds: [],
            } as CampaignItem,
            config as CampaignConfig,
          );
      row = {
        key: launch.id + ":" + id,
        name: name.slice(0, 500),
        country,
        countryName: country ? countryName(country) : "No registrado",
        campaignId: id,
        accountId: launch.accountId,
        createdAt: launch.createdAt,
        completedAt: launch.updatedAt,
        adsets: new Set(),
        ads: new Set(),
        href: metaObjectURL({
          id,
          accountId: launch.accountId,
          level: "campaign",
        }),
      };
      result.set(id, row);
    }
    for (const child of steps) {
      if (
        child?.campaign !== step.campaign ||
        child.state !== "DONE" ||
        child.existing ||
        !/^\d{1,40}$/.test(String(child.id ?? ""))
      )
        continue;
      if (child.kind === "ADSET") row.adsets.add(String(child.id));
      if (child.kind === "AD") row.ads.add(String(child.id));
    }
  }
  return [...result.values()].map(({ adsets, ads, ...row }) => ({
    ...row,
    adsetCount: adsets.size,
    adCount: ads.size,
  }));
}
