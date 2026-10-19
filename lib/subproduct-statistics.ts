import { Prisma } from "@prisma/client";
import { db } from "./db";
import { dateRange } from "./hierarchy-filters";
import type { SubproductStatistics } from "./subproduct-statistics-types";

/** IDs must come from subproductFilter after category NAVIGATE authorization.
 * Period is the request date (GenerationJob.createdAt), in Lima, for every metric.
 * Generated includes removed/expired results; deletion is current global trash or
 * this viewer's LibraryExclusion, never expiry or another viewer's exclusion.
 */
export async function subproductStatistics(
  user: { id: string; role: string },
  subproductIds: string[],
  params: URLSearchParams,
): Promise<Map<string, SubproductStatistics>> {
  const dates = dateRange(params);
  if (!subproductIds.length) return new Map();
  const rows = await db.$queryRaw<
    ({ id: string } & SubproductStatistics)[]
  >(Prisma.sql`
    SELECT j."subproductId" AS id,
      COUNT(v.id)::integer AS generated,
      COUNT(v.id) FILTER (WHERE v."deletedAt" IS NOT NULL OR e."variationId" IS NOT NULL)::integer AS deleted,
      COUNT(v.id) FILTER (WHERE j.status='COMPLETED' AND j.snapshot->>'previewFirst'='true'
        AND j.snapshot->>'index'='0' AND v."reviewStatus"<>'APPROVED')::integer AS unapproved,
      COUNT(*) FILTER (WHERE j.status IN ('PENDING','CANCELLED') AND v.id IS NULL
        AND j.snapshot->>'previewFirst'='true' AND j.snapshot->>'index'<>'0'
        AND EXISTS (
          SELECT 1 FROM "GenerationJob" f JOIN "Variation" fv ON fv."jobId"=f.id
          WHERE f."actorId"=j."actorId" AND f."subproductId"=j."subproductId"
            AND f.status='COMPLETED' AND f.snapshot->>'previewFirst'='true'
            AND f.snapshot->>'approvalGroup'=j.snapshot->>'approvalGroup'
            AND f.snapshot->>'index'='0' AND fv."reviewStatus"<>'APPROVED'
        ))::integer AS "approvalBlocked",
      COUNT(*) FILTER (WHERE j.status='FAILED')::integer AS failed,
      COUNT(*) FILTER (WHERE j.status='UNCERTAIN')::integer AS uncertain
    FROM "GenerationJob" j
    LEFT JOIN "Variation" v ON v."jobId"=j.id
    LEFT JOIN "LibraryExclusion" e ON e."variationId"=v.id AND e."userId"=${user.id}
    WHERE j."subproductId"=ANY(${subproductIds}::text[])
      AND (${dates.gte ?? null}::timestamptz IS NULL OR j."createdAt">=${dates.gte ?? null})
      AND (${dates.lt ?? null}::timestamptz IS NULL OR j."createdAt"<${dates.lt ?? null})
      AND (${user.role === "OWNER"} OR
        (${user.role !== "OBSERVER"} AND j."actorId"=${user.id}) OR
        (j.status='COMPLETED' AND v."deletedAt" IS NULL AND (v."reviewStatus"='APPROVED' OR EXISTS (
          SELECT 1 FROM "LibraryItem" li WHERE li."variationId"=v.id AND li."userId"=${user.id}
        ))))
    GROUP BY j."subproductId"
  `);
  const result = new Map(rows.map(({ id, ...counts }) => [id, counts]));
  for (const id of subproductIds)
    if (!result.has(id))
      result.set(id, {
        generated: 0,
        deleted: 0,
        unapproved: 0,
        approvalBlocked: 0,
        failed: 0,
        uncertain: 0,
      });
  return result;
}
