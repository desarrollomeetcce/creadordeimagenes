import { db } from "./db";
/** Only disposable derived caches; saved facts, credentials, cursors and public content are untouched. */
export async function cleanupDerivedCaches(now = new Date()) {
  const before = new Date(now.getTime() - 7 * 86400000);
  const [summaries, pages] = await Promise.all([
    db.$executeRaw`WITH old AS (SELECT "objectId" FROM "MetaInsightCache" WHERE "updatedAt"<${before} ORDER BY "updatedAt" LIMIT 250 FOR UPDATE SKIP LOCKED) DELETE FROM "MetaInsightCache" c USING old WHERE c."objectId"=old."objectId" AND c."updatedAt"<${before}`,
    db.$executeRaw`WITH old AS (SELECT "accountId" FROM "CreativeMetaPageDirectory" WHERE "fetchedAt"<${before} ORDER BY "fetchedAt" LIMIT 250 FOR UPDATE SKIP LOCKED) DELETE FROM "CreativeMetaPageDirectory" c USING old WHERE c."accountId"=old."accountId" AND c."fetchedAt"<${before}`,
  ]);
  return { cacheRows: summaries + pages };
}
