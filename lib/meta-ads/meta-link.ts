// Ads Manager uses a different level and selected ID for each object type.
export function metaObjectURL(item: {
  id: string;
  accountId: string;
  level: string;
  campaignId?: string;
  adsetId?: string;
}): string | null {
  const routes: Record<string, string> = {
    campaign: "campaigns",
    adset: "adsets",
    ad: "ads",
  };
  const route = routes[item.level];
  if (
    !route ||
    !/^\d{1,40}$/.test(item.id) ||
    !/^\d{1,40}$/.test(item.accountId)
  )
    return null;
  const url = new URL(
    `https://adsmanager.facebook.com/adsmanager/manage/${route}`,
  );
  url.searchParams.set("act", item.accountId);
  if (item.level !== "campaign" && /^\d{1,40}$/.test(item.campaignId ?? ""))
    url.searchParams.set("selected_campaign_ids", item.campaignId!);
  if (item.level === "ad" && /^\d{1,40}$/.test(item.adsetId ?? ""))
    url.searchParams.set("selected_adset_ids", item.adsetId!);
  url.searchParams.set(`selected_${item.level}_ids`, item.id);
  return url.toString();
}
