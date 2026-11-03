import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { localDay, shiftDay } from "./analytics";
/** Compact DB-only change signal. Callers must supply their already authorized account scope. */
export async function recentMetaDataVersions(
  accounts: { id: string; timezone: string }[],
  tx: Prisma.TransactionClient = db,
) {
  if (!accounts.length) return new Map<string, string | null>();
  const rows = await tx.metaAdDaily.groupBy({
    by: ["accountId"],
    where: {
      scope: "7d_click,1d_view|impression",
      OR: accounts.map((a) => ({
        accountId: a.id,
        day: {
          gte: shiftDay(localDay(a.timezone), -1),
          lte: localDay(a.timezone),
        },
      })),
    },
    _max: { updatedAt: true },
  });
  return new Map(
    rows.map((r) => [r.accountId, r._max.updatedAt?.toISOString() ?? null]),
  );
}
