import type { Prisma } from "@prisma/client";
import { localDay } from "./analytics";
/** Delivery is today's saved activity in each account's timezone, never configured status. */
export function deliveryActivityWhere(
  accounts: { id: string; timezone: string }[],
): Prisma.MetaAdObjectWhereInput {
  return {
    OR: accounts.map((a) => ({
      accountId: a.id,
      daily: {
        some: {
          accountId: a.id,
          day: localDay(a.timezone),
          scope: "7d_click,1d_view|impression",
          OR: [{ spend: { gt: 0 } }, { impressions: { gt: 0 } }],
        },
      },
    })),
  };
}
