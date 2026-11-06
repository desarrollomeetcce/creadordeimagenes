import { Prisma } from "@prisma/client";
import { db } from "../db";
import { financialAccess, scopePermission } from "./financial-access";
import type { Actor } from "./service";

export type PendingInventoryCampaign = {
  aliasId: string;
  listId: string;
  tableId: string;
  name: string;
  country: string;
  itemId: string;
  createdPaused: boolean;
};
/** Tasks are projected separately from real campaigns; never contribute to Meta counts or metrics. */
export async function pendingInventoryCampaigns(
  actor: Actor,
  accountIds: string[],
  query: { level: string; state: string; q: string; country?: string | null },
) {
  if (
    query.level !== "campaign" ||
    !["all","active",""].includes(query.state) ||
    !accountIds.length
  )
    return [];
  const access = await financialAccess(actor);
  const all = !!scopePermission(access, "ALL"),
    lists = access.grants
      .filter((g) => g.scope.startsWith("TAB:"))
      .map((g) => g.scope.slice(4));
  if (!all && !lists.length) return [];
  const rows = await db.$queryRaw<PendingInventoryCampaign[]>(Prisma.sql`
    SELECT a.id AS "aliasId",s.id AS "listId",a."tableId",a.name,substring(c.key from length(a.id)+2) AS country,
      COALESCE(i.id,a.id) AS "itemId",
      EXISTS(SELECT 1 FROM "MetaAdObject" o WHERE o."aliasId"=a.id AND o."aliasCountry"=substring(c.key from length(a.id)+2) AND o.level='campaign' AND o.status='PAUSED' AND o."accountId" IN (${Prisma.join(accountIds)})) AS "createdPaused"
    FROM "MetaEffectivenessSheet" s
    CROSS JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(s.config->'inventoryActivation'->'rows')='object' THEN s.config->'inventoryActivation'->'rows' ELSE '{}'::jsonb END) c
    JOIN "MetaAlias" a ON a."inventorySheetId"=s.id AND left(c.key,length(a.id)+1)=a.id||'|'
    LEFT JOIN "MetaInventoryItem" i ON i."sheetId"=s.id AND i.name=a.name
    WHERE s.kind='INVENTORY' AND s."archivedAt" IS NULL
      ${all ? Prisma.empty : Prisma.sql`AND s.id IN (${Prisma.join(lists)})`}
      AND c.value->>'campaignTask'='CREATE'
      AND EXISTS(SELECT 1 FROM jsonb_array_elements_text(COALESCE(c.value->'metaOrigin'->'accountIds','[]'::jsonb)) x WHERE x.value IN (${Prisma.join(accountIds)}))
      ${query.country ? Prisma.sql`AND substring(c.key from length(a.id)+2)=${query.country}` : Prisma.empty}
      ${query.q ? Prisma.sql`AND strpos(lower(a.name),lower(${query.q}))>0` : Prisma.empty}
    ORDER BY a.name,a.id,c.key LIMIT 100
  `);
  return rows;
}
