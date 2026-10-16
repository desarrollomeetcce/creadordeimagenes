import { db } from "./db";
import { ownerOnly } from "./auth";
import { demand } from "./errors";
import type { ConsumptionRow, StatisticsReport } from "./statistics-types";

type Aggregate = {
  dimension: string;
  id: string;
  label: string;
  totalGroups: bigint;
  operations: bigint;
  reservedMicros: string;
  knownActualMicros: string;
  knownCosts: bigint;
  unknownCosts: bigint;
  uncertain: bigint;
  images: bigint;
  approved: bigint;
  pricedImages: bigint;
  pricedImageMicros: string;
  pricedApproved: bigint;
  pricedApprovedMicros: string;
};
const row = (r: Aggregate): ConsumptionRow => ({
  id: r.id,
  label: r.label,
  operations: Number(r.operations),
  reservedMicros: r.reservedMicros,
  knownActualMicros: r.knownActualMicros,
  knownCosts: Number(r.knownCosts),
  unknownCosts: Number(r.unknownCosts),
  uncertain: Number(r.uncertain),
  images: Number(r.images),
  approved: Number(r.approved),
  pricedImages: Number(r.pricedImages),
  pricedImageMicros: r.pricedImageMicros,
  pricedApproved: Number(r.pricedApproved),
  pricedApprovedMicros: r.pricedApprovedMicros,
});

export async function statistics(
  actor: { role: string },
  requestedDays: string | null,
): Promise<StatisticsReport> {
  ownerOnly(actor);
  const days = Number(requestedDays ?? "30");
  demand(
    [7, 30, 90].includes(days),
    "Selecciona un período de 7, 30 o 90 días.",
  );
  const end = new Date();
  // Peru has a fixed UTC-5 offset. Include today and the preceding calendar days.
  const lima = new Date(end.getTime() - 5 * 3600000);
  const start = new Date(
    Date.UTC(
      lima.getUTCFullYear(),
      lima.getUTCMonth(),
      lima.getUTCDate() - days + 1,
      5,
    ),
  );
  return db.$transaction(
    async (tx) => {
      const projects = await tx.project.count({ where: { deletedAt: null } });
      const trash = await tx.project.count({
        where: { deletedAt: { not: null } },
      });
      const categories = await tx.category.count({
        where: { project: { deletedAt: null } },
      });
      const subproducts = await tx.subproduct.count({
        where: { category: { project: { deletedAt: null } } },
      });
      const accounts = await tx.user.count();
      const pendingAccounts = await tx.user.count({
        where: { status: "PENDING" },
      });
      const jobs = await tx.generationJob.groupBy({
        by: ["status"],
        where: { createdAt: { gte: start, lte: end } },
        _count: true,
      });
      // Aggregate the entire period in Postgres; never total the limited /usage page.
      // Each dimension has its own identifier, so equal names do not merge resources.
      const aggregates = await tx.$queryRaw<Aggregate[]>`
      WITH totals AS (
        SELECT d.dimension, d.id, max(d.label) AS label,
          count(*) AS operations,
          coalesce(sum(l."reservedMicros") FILTER (WHERE l.status <> 'RELEASED'), 0)::text AS "reservedMicros",
          coalesce(sum(l."actualMicros"), 0)::text AS "knownActualMicros",
          count(l."actualMicros") AS "knownCosts",
          count(*) FILTER (WHERE l."actualMicros" IS NULL AND l.status <> 'RELEASED') AS "unknownCosts",
          count(*) FILTER (WHERE l.status = 'UNCERTAIN') AS uncertain,
          count(v.id) AS images,
          count(v.id) FILTER (WHERE v."reviewStatus" = 'APPROVED') AS approved,
          count(v.id) FILTER (WHERE l."actualMicros" IS NOT NULL) AS "pricedImages",
          coalesce(sum(l."actualMicros") FILTER (WHERE v.id IS NOT NULL), 0)::text AS "pricedImageMicros",
          count(v.id) FILTER (WHERE v."reviewStatus" = 'APPROVED' AND l."actualMicros" IS NOT NULL) AS "pricedApproved",
          coalesce(sum(l."actualMicros") FILTER (WHERE v."reviewStatus" = 'APPROVED'), 0)::text AS "pricedApprovedMicros"
        FROM "UsageLedger" l
        LEFT JOIN "GenerationJob" j ON j.id = l."jobId"
        LEFT JOIN "User" u ON u.id = l."actorId"
        LEFT JOIN "Project" p ON p.id = l."projectId"
        LEFT JOIN "Subproduct" s ON s.id = j."subproductId"
        LEFT JOIN "Category" c ON c.id = s."categoryId"
        LEFT JOIN "Variation" v ON v."jobId" = l."jobId"
        CROSS JOIN LATERAL (VALUES
          ('total', 'all', 'Total'),
          ('day', to_char(l."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Lima', 'YYYY-MM-DD'), to_char(l."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Lima', 'YYYY-MM-DD')),
          ('month', to_char(l."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Lima', 'YYYY-MM'), to_char(l."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Lima', 'YYYY-MM')),
          ('user', l."actorId", coalesce(u.name, 'Cuenta no disponible')),
          ('project', l."projectId", coalesce(p.name, 'Proyecto no disponible')),
          ('category', coalesce(c.id, 'unassigned'), coalesce(p.name || ' / ' || c.name, 'Sin categoría')),
          ('subproduct', coalesce(s.id, 'unassigned'), coalesce(p.name || ' / ' || c.name || ' / ' || s.name, 'Sin subproducto')),
          ('model', l.model, l.model)
        ) d(dimension, id, label)
        WHERE l."createdAt" >= ${start} AND l."createdAt" <= ${end}
        GROUP BY d.dimension, d.id
      ), ranked AS (
        SELECT *, count(*) OVER (PARTITION BY dimension) AS "totalGroups",
          row_number() OVER (PARTITION BY dimension ORDER BY operations DESC, id) AS position
        FROM totals
      ) SELECT * FROM ranked WHERE position <= CASE WHEN dimension IN ('day','month') THEN 100 ELSE 20 END
    `;
      const groups: StatisticsReport["groups"] = {};
      for (const dimension of [
        "day",
        "month",
        "user",
        "project",
        "category",
        "subproduct",
        "model",
      ]) {
        const entries = aggregates.filter((r) => r.dimension === dimension);
        if (["day", "month"].includes(dimension))
          entries.sort((a, b) => a.id.localeCompare(b.id));
        groups[dimension] = {
          totalGroups: Number(entries[0]?.totalGroups ?? 0),
          rows: entries.map(row),
        };
      }
      const total = aggregates.find((r) => r.dimension === "total");
      return {
        generatedAt: end.toISOString(),
        period: {
          days,
          start: start.toISOString(),
          end: end.toISOString(),
          timeZone: "America/Lima",
        },
        inventory: {
          projects,
          trash,
          categories,
          subproducts,
          accounts,
          pendingAccounts,
        },
        jobs: jobs.map((j) => ({ status: j.status, count: j._count })),
        total: total
          ? row(total)
          : {
              id: "all",
              label: "Total",
              operations: 0,
              reservedMicros: "0",
              knownActualMicros: "0",
              knownCosts: 0,
              unknownCosts: 0,
              uncertain: 0,
              images: 0,
              approved: 0,
              pricedImages: 0,
              pricedImageMicros: "0",
              pricedApproved: 0,
              pricedApprovedMicros: "0",
            },
        groups,
      };
    },
    { isolationLevel: "RepeatableRead", timeout: 15000 },
  );
}
