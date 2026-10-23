import { Prisma } from "@prisma/client";
// Only ads whose entire life is contained in a completed daily report can use
// that report as a lifetime total. Missing rows of older ads never mean zero.
export async function deriveCoveredTotals(
  tx: Prisma.TransactionClient,
  a: { id: string; timezone: string },
  s: { since: string; until: string; started: string; adIds: string[] },
) {
  if (!s.adIds.length) return;
  await tx.$executeRaw(Prisma.sql`
WITH objects AS (
 SELECT id,(("createdTime" AT TIME ZONE 'UTC') AT TIME ZONE ${a.timezone})::date::text since
 FROM "MetaAdObject" WHERE "accountId"=${a.id} AND id IN (${Prisma.join(s.adIds)}) AND "createdTime" IS NOT NULL
 AND (("createdTime" AT TIME ZONE 'UTC') AT TIME ZONE ${a.timezone})::date::text BETWEEN ${s.since} AND ${s.until}
), daily_facts AS (SELECT d.* FROM "MetaAdDaily" d JOIN objects o ON o.id=d."objectId" WHERE d."accountId"=${a.id} AND d.scope='7d_click,1d_view|impression' AND d.day BETWEEN o.since AND ${s.until}),
base AS (SELECT "objectId",sum(spend) spend,sum(impressions) impressions,sum(clicks) clicks FROM daily_facts GROUP BY "objectId"),
actions AS (SELECT d."objectId",j.key,sum(j.value::numeric) amount FROM daily_facts d CROSS JOIN LATERAL jsonb_each_text(d.actions) j GROUP BY d."objectId",j.key),
packed AS (SELECT "objectId",jsonb_object_agg(key,amount) actions FROM actions GROUP BY "objectId")
INSERT INTO "MetaAdTotal"("objectId","accountId",since,until,scope,spend,impressions,clicks,actions,"updatedAt")
SELECT o.id,${a.id},o.since,${s.until},'7d_click,1d_view|impression',COALESCE(b.spend,0),COALESCE(b.impressions,0),COALESCE(b.clicks,0),COALESCE(p.actions,'{}'::jsonb),NOW() FROM objects o LEFT JOIN base b ON b."objectId"=o.id LEFT JOIN packed p ON p."objectId"=o.id
ON CONFLICT("objectId") DO UPDATE SET since=EXCLUDED.since,until=EXCLUDED.until,scope=EXCLUDED.scope,spend=EXCLUDED.spend,impressions=EXCLUDED.impressions,clicks=EXCLUDED.clicks,actions=EXCLUDED.actions,"updatedAt"=NOW()
WHERE "MetaAdTotal"."accountId"=EXCLUDED."accountId" AND "MetaAdTotal"."updatedAt"<${new Date(s.started)}
`);
}
