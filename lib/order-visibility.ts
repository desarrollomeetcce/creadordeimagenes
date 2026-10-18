import { db } from "./db";

/** Presentation only: stopped attempts remain intact in history and accounting. */
export function emptyStoppedOrder(
  status: string,
  jobs: { status: string; variation?: unknown }[],
) {
  return (
    status === "STOPPED" &&
    jobs.length > 0 &&
    jobs.every(
      (job) =>
        ["CANCELLED", "FAILED", "UNCERTAIN"].includes(job.status) &&
        !job.variation,
    )
  );
}

/** A first empty stopped attempt must not leave a new automatic library folder. */
export async function emptyStoppedSubproducts(
  ids: string[],
): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT j."subproductId" AS id FROM "GenerationJob" j
    LEFT JOIN "Variation" v ON v."jobId"=j.id
    LEFT JOIN "GenerationOrder" o ON o.id=j.snapshot->>'orderId' AND o."requestKey" LIKE 'order:%'
    WHERE j."subproductId"=ANY(${ids}::text[])
    GROUP BY j."subproductId"
    HAVING count(DISTINCT o.id)=1 AND count(o.id)=count(*)
      AND bool_and(o.status='STOPPED' AND j.status IN ('CANCELLED','FAILED','UNCERTAIN') AND v.id IS NULL)
      AND NOT EXISTS (SELECT 1 FROM "Variation" saved WHERE saved."subproductId"=j."subproductId")
      AND NOT EXISTS (SELECT 1 FROM "LibraryFolder" f WHERE f."anchorScope"='subproduct' AND f."anchorId"=j."subproductId")
  `;
  return new Set(rows.map((row) => row.id));
}
