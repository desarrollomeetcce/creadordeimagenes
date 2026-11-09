import { Prisma } from "@prisma/client";
import { db } from "../db";
import { localDay, shiftDay } from "./analytics";
/** Callers supply an authorized account scope. Two indexed latest-row lookups per account. */
export async function recentMetaDataVersions(
  accounts: { id: string; timezone: string }[],
  tx: Prisma.TransactionClient = db,
) {
  if (!accounts.length) return new Map<string, string | null>();
  const days = accounts.flatMap((a) => {
    const today = localDay(a.timezone);
    return [
      [a.id, shiftDay(today, -1)],
      [a.id, today],
    ];
  });
  const rows = await tx.$queryRaw<{ accountId: string; updatedAt: Date }[]>`
 WITH wanted("accountId",day) AS (VALUES ${Prisma.join(days.map(([id, day]) => Prisma.sql`(${id}::text,${day}::text)`))})
 SELECT w."accountId",MAX(latest."updatedAt") AS "updatedAt" FROM wanted w
 CROSS JOIN LATERAL (SELECT d."updatedAt" FROM "MetaAdDaily" d WHERE d."accountId"=w."accountId" AND d.scope='7d_click,1d_view|impression' AND d.day=w.day ORDER BY d."updatedAt" DESC LIMIT 1) latest
 GROUP BY w."accountId"`;
  return new Map(rows.map((r) => [r.accountId, r.updatedAt.toISOString()]));
}
