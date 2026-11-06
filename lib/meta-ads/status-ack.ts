import { parseDeliveryFilters } from "./state-filter";
export type MetaStatusAck = {
  inventoryCampaignTask?: "NONE" | "CREATE" | "STOP";
  objectId: string;
  accountId: string;
  level: string;
  status: "ACTIVE" | "PAUSED";
  effectiveStatus: string | null;
  seenAt: string;
};
/** Apply only confirmed writes, preserving financial facts and newer remote observations. */
export function applyMetaStatusAck<
  T extends {
    id: string;
    accountId: string;
    campaignId: string;
    adsetId: string;
    status: string;
    effectiveStatus: string;
    seenAt: string;
    statusStale?: boolean;
  },
>(item: T, ack: MetaStatusAck): T {
  if (
    item.accountId !== ack.accountId ||
    Date.parse(item.seenAt) > Date.parse(ack.seenAt)
  )
    return item;
  if (item.id === ack.objectId)
    return {
      ...item,
      status: ack.status,
      ...(ack.inventoryCampaignTask ? { campaignTask: ack.inventoryCampaignTask } : {}),
      effectiveStatus: ack.effectiveStatus ?? "",
      seenAt: ack.seenAt,
      statusStale: ack.status === "ACTIVE",
    };
  if (
    item.status !== "ACTIVE" ||
    !(ack.level === "campaign"
      ? item.campaignId === ack.objectId
      : ack.level === "adset" && item.adsetId === ack.objectId)
  )
    return item;
  return {
    ...item,
    effectiveStatus:
      ack.status === "PAUSED"
        ? ack.level === "campaign"
          ? "CAMPAIGN_PAUSED"
          : "ADSET_PAUSED"
        : "",
    seenAt: ack.seenAt,
    statusStale: ack.status === "ACTIVE",
  };
}

/** Only status predicates are reconciled locally; delivery/financial rules stay on the server. */
export function matchesMetaStatusFilter(
  item: { status: string; effectiveStatus: string },
  state: string,
) {
  const filters = parseDeliveryFilters(state) ?? [];
  return (
    (!filters.includes("active") || item.status === "ACTIVE") &&
    (!filters.includes("paused") ||
      [item.status, item.effectiveStatus].some((s) =>
        ["PAUSED", "CAMPAIGN_PAUSED", "ADSET_PAUSED"].includes(s),
      )) &&
    (!filters.includes("effective") || item.effectiveStatus === "ACTIVE")
  );
}
