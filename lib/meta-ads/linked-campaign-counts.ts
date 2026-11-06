import { db } from "../db";
import { countryCodes } from "./countries";

export type LinkedCampaignCountryCount = { country: string; active: number };

/** Account IDs come from dashboard's authorized account scope, never from an unchecked request. */
export async function linkedCampaignCountryCounts(
  authorizedAccountIds: string[],
): Promise<LinkedCampaignCountryCount[]> {
  if (!authorizedAccountIds.length) return [];
  const groups = await db.metaAdObject.groupBy({
    by: ["aliasCountry"],
    where: {
      accountId: { in: authorizedAccountIds },
      level: "campaign",
      status: "ACTIVE",
      aliasCountry: { in: countryCodes },
      alias: {
        is: { inventorySheet: { is: { kind: "INVENTORY", archivedAt: null } } },
      },
    },
    _count: { _all: true },
    orderBy: { aliasCountry: "asc" },
  });
  return groups.map((g) => ({
    country: g.aliasCountry!,
    active: g._count._all,
  }));
}
