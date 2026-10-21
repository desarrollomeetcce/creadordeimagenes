import { Prisma } from "@prisma/client";
import { db } from "../db";
export type InsightSummary = {
  objectId: string;
  key: string;
  spend: number;
  impressions: number;
  clicks: number;
  actions: unknown;
  first: string | null;
  last: string | null;
  active: number;
};
type ObjectScope = { id: string; accountId: string };
type AccountScope = { id: string; today: string; version: string };
// Only aggregate facts are cached. Authorization and freshness are checked by the dashboard on every request.
export async function insightSummaries(
  objects: ObjectScope[],
  accounts: AccountScope[],
  since: string | null = null,
  until: string | null = null,
): Promise<InsightSummary[]> {
  if (!objects.length) return [];
  const contexts = new Map(accounts.map((a) => [a.id, a]));
  const objectAccounts = new Map(objects.map((o) => [o.id, o.accountId]));
  const stored = await db.metaInsightCache.findMany({
    where: { objectId: { in: objects.map((o) => o.id) } },
    select: { objectId: true, day: true, version: true, rows: true },
  });
  const valid = new Map(
    stored
      .filter((row) => {
        const accountId = objectAccounts.get(row.objectId);
        const a = accountId ? contexts.get(accountId) : null;
        return a && row.version === a.version && row.day === a.today;
      })
      .map((row) => [row.objectId, row.rows as unknown as InsightSummary[]]),
  );
  const missing = objects.filter((o) => !valid.has(o.id));
  if (missing.length) {
    const fresh = await aggregate(missing, accounts);
    const grouped = new Map<string, InsightSummary[]>(
      missing.map((o) => [o.id, []]),
    );
    for (const row of fresh) grouped.get(row.objectId)?.push(row);
    for (let offset = 0; offset < missing.length; offset += 250) {
      const batch = missing
        .slice(offset, offset + 250)
        .map((o) => ({
          objectId: o.id,
          day: contexts.get(o.accountId)!.today,
          version: contexts.get(o.accountId)!.version,
          rows: grouped.get(o.id) ?? [],
        }));
      await db.$executeRaw(
        Prisma.sql`INSERT INTO "MetaInsightCache"("objectId",day,version,"rows","updatedAt") SELECT x."objectId",x.day,x.version,x."rows",NOW() FROM jsonb_to_recordset(${JSON.stringify(batch)}::jsonb) AS x("objectId" text,day text,version text,"rows" jsonb) ON CONFLICT("objectId") DO UPDATE SET day=EXCLUDED.day,version=EXCLUDED.version,"rows"=EXCLUDED."rows","updatedAt"=EXCLUDED."updatedAt"`,
      );
    }
    for (const [id, rows] of grouped) valid.set(id, rows);
  }
  const base = objects.flatMap((o) => valid.get(o.id) ?? []);
  if (!since || !until) return base;
  return [...base, ...(await aggregateCustom(objects, since, until))];
}
async function aggregate(
  objects: ObjectScope[],
  accounts: AccountScope[],
): Promise<InsightSummary[]> {
  return db.$queryRaw<InsightSummary[]>(Prisma.sql`
WITH scoped AS (SELECT d.*,a.today FROM "MetaAdDaily" d JOIN (VALUES ${Prisma.join(accounts.map((a) => Prisma.sql`(${a.id},${a.today})`))}) a(id,today) ON a.id=d."accountId" WHERE d."objectId" IN (${Prisma.join(objects.map((o) => o.id))}) AND d.scope='7d_click,1d_view|impression'),
activity AS (SELECT "objectId",min(day) FILTER(WHERE spend>0 OR impressions>0) first,max(day) FILTER(WHERE spend>0 OR impressions>0) last,count(*) FILTER(WHERE spend>0 OR impressions>0)::int active FROM scoped GROUP BY "objectId"),
expanded AS (SELECT s.*,p.key FROM scoped s CROSS JOIN (VALUES ('today'),('7'),('15'),('30'),('lifetime'),('previous7'),('complete7')) p(key) WHERE CASE p.key WHEN 'today' THEN s.day=s.today WHEN '7' THEN s.day BETWEEN to_char(s.today::date-6,'YYYY-MM-DD') AND s.today WHEN '15' THEN s.day BETWEEN to_char(s.today::date-14,'YYYY-MM-DD') AND s.today WHEN '30' THEN s.day BETWEEN to_char(s.today::date-29,'YYYY-MM-DD') AND s.today WHEN 'previous7' THEN s.day BETWEEN to_char(s.today::date-14,'YYYY-MM-DD') AND to_char(s.today::date-8,'YYYY-MM-DD') WHEN 'complete7' THEN s.day BETWEEN to_char(s.today::date-7,'YYYY-MM-DD') AND to_char(s.today::date-1,'YYYY-MM-DD') ELSE s.day<=s.today END),
base AS (SELECT "objectId",key,sum(spend)::float8 spend,sum(impressions)::float8 impressions,sum(clicks)::float8 clicks FROM expanded GROUP BY "objectId",key),
actions AS (SELECT e."objectId",e.key,j.key action,sum(j.value::numeric)::float8 amount FROM expanded e CROSS JOIN LATERAL jsonb_each_text(e.actions) j GROUP BY e."objectId",e.key,j.key),
packed AS (SELECT "objectId",key,jsonb_object_agg(action,amount) actions FROM actions GROUP BY "objectId",key)
SELECT b.*,COALESCE(p.actions,'{}'::jsonb) actions,a.first,a.last,a.active FROM base b LEFT JOIN packed p ON p."objectId"=b."objectId" AND p.key=b.key LEFT JOIN activity a ON a."objectId"=b."objectId"`);
}
async function aggregateCustom(
  objects: ObjectScope[],
  since: string,
  until: string,
): Promise<InsightSummary[]> {
  return db.$queryRaw<InsightSummary[]>(Prisma.sql`
WITH scoped AS (SELECT * FROM "MetaAdDaily" WHERE "objectId" IN (${Prisma.join(objects.map((o) => o.id))}) AND scope='7d_click,1d_view|impression' AND day BETWEEN ${since} AND ${until}),
base AS (SELECT "objectId",sum(spend)::float8 spend,sum(impressions)::float8 impressions,sum(clicks)::float8 clicks FROM scoped GROUP BY "objectId"),
actions AS (SELECT e."objectId",j.key action,sum(j.value::numeric)::float8 amount FROM scoped e CROSS JOIN LATERAL jsonb_each_text(e.actions) j GROUP BY e."objectId",j.key),
packed AS (SELECT "objectId",jsonb_object_agg(action,amount) actions FROM actions GROUP BY "objectId")
SELECT b.*,'custom'::text key,COALESCE(p.actions,'{}'::jsonb) actions,NULL::text first,NULL::text last,0::int active FROM base b LEFT JOIN packed p ON p."objectId"=b."objectId"`);
}
