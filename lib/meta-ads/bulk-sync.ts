import type { Prisma } from "@prisma/client";
// All rows are normalized/authorized under the sync lease before reaching this helper.
export async function writeSyncPage(
  tx: Prisma.TransactionClient,
  objects: Record<string, unknown>[],
  daily: Record<string, unknown>[],
  metadata: boolean,
) {
  const uniqueObjects = [
    ...new Map(objects.map((row) => [row.id, row])).values(),
  ];
  if (uniqueObjects.length) {
    const data = JSON.stringify(uniqueObjects);
    if (metadata)
      await tx.$executeRaw`
      INSERT INTO "MetaAdObject" (id,"accountId",level,name,"campaignId","adsetId",objective,"optimizationGoal",status,"effectiveStatus","createdTime","scheduledStart","thumbnailUrl","seenAt")
      SELECT id,"accountId",level,name,"campaignId","adsetId",objective,"optimizationGoal",status,"effectiveStatus","createdTime","scheduledStart","thumbnailUrl",COALESCE("seenAt",NOW())
      FROM jsonb_to_recordset(${data}::jsonb) AS r(id text,"accountId" text,level text,name text,"campaignId" text,"adsetId" text,objective text,"optimizationGoal" text,status text,"effectiveStatus" text,"createdTime" timestamp,"scheduledStart" timestamp,"thumbnailUrl" text,"seenAt" timestamp)
      ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name,level=EXCLUDED.level,"campaignId"=EXCLUDED."campaignId","adsetId"=EXCLUDED."adsetId",objective=EXCLUDED.objective,"optimizationGoal"=EXCLUDED."optimizationGoal",status=EXCLUDED.status,"effectiveStatus"=EXCLUDED."effectiveStatus","createdTime"=EXCLUDED."createdTime","scheduledStart"=EXCLUDED."scheduledStart","thumbnailUrl"=EXCLUDED."thumbnailUrl","seenAt"=EXCLUDED."seenAt"
      WHERE "MetaAdObject"."accountId"=EXCLUDED."accountId"
    `;
    else
      await tx.metaAdObject.createMany({
        data: uniqueObjects as Prisma.MetaAdObjectCreateManyInput[],
        skipDuplicates: true,
      });
  }
  const uniqueDaily = [
    ...new Map(
      daily.map((row) => [row.objectId + ":" + row.day + ":" + row.scope, row]),
    ).values(),
  ];
  if (uniqueDaily.length)
    await tx.$executeRaw`
    INSERT INTO "MetaAdDaily" (id,"accountId","objectId",day,scope,spend,impressions,clicks,actions,"updatedAt")
    SELECT id,"accountId","objectId",day,scope,spend,impressions,clicks,actions,NOW()
    FROM jsonb_to_recordset(${JSON.stringify(uniqueDaily)}::jsonb) AS r(id text,"accountId" text,"objectId" text,day text,scope text,spend numeric,impressions double precision,clicks double precision,actions jsonb)
    ON CONFLICT ("objectId",day,scope) DO UPDATE SET spend=EXCLUDED.spend,impressions=EXCLUDED.impressions,clicks=EXCLUDED.clicks,actions=EXCLUDED.actions,"updatedAt"=EXCLUDED."updatedAt"
    WHERE "MetaAdDaily"."accountId"=EXCLUDED."accountId"
  `;
}
