import type { Prisma } from "@prisma/client";
import { localDay, shiftDay } from "./analytics";
/** Delivery means positive spend in the report period, regardless of current status. */
export function deliveryActivityWhere(
  accounts: { id: string; timezone: string }[],
  period: string,
  since: string | null = null,
  until: string | null = null,
): Prisma.MetaAdObjectWhereInput {
  return {
    OR: accounts.map((a) => {
      const today = localDay(a.timezone);
      const day =
        period === "custom"
          ? { gte: since!, lte: until! }
          : period === "lifetime"
            ? { lte: today }
            : {
                gte: shiftDay(
                  today,
                  -(Number(period === "today" ? 1 : period) - 1),
                ),
                lte: today,
              };
      const daily = {
        daily: {
          some: {
            accountId: a.id,
            day,
            scope: "7d_click,1d_view|impression",
            spend: { gt: 0 },
          },
        },
      };
      return {
        accountId: a.id,
        ...(period === "lifetime"
          ? {
              OR: [
                daily,
                {
                  total: {
                    is: {
                      accountId: a.id,
                      scope: "7d_click,1d_view|impression",
                      spend: { gt: 0 },
                      until: { lte: today },
                    },
                  },
                },
              ],
            }
          : daily),
      };
    }),
  };
}
