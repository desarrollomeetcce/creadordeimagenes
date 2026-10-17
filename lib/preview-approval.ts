import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { demand } from "./errors";
import { jobResourceAccess, ownerOnly } from "./auth";
import { recordActivity } from "./activity";
type Reader = Pick<Prisma.TransactionClient, "generationJob">;
type Job = { actorId: string; snapshot: unknown };
export function approvalGroup(job: Job) {
  const s = job.snapshot as Record<string, unknown>;
  return s.previewFirst === true && typeof s.approvalGroup === "string"
    ? s.approvalGroup
    : null;
}
export async function groupApproved(tx: Reader, job: Job) {
  const group = approvalGroup(job);
  if (!group) return true;
  const first = await tx.generationJob.findFirst({
    where: {
      actorId: job.actorId,
      status: "COMPLETED",
      variation: { reviewStatus: "APPROVED", deletedAt: null, expired: false },
      AND: [
        { snapshot: { path: ["approvalGroup"], equals: group } },
        { snapshot: { path: ["index"], equals: 0 } },
      ],
    },
    select: {
      status: true,
      variation: {
        select: { reviewStatus: true, deletedAt: true, expired: true },
      },
    },
  });
  return (
    first?.status === "COMPLETED" &&
    first.variation?.reviewStatus === "APPROVED" &&
    !first.variation.deletedAt &&
    !first.variation.expired
  );
}
export async function waitingForApproval(tx: Reader, job: Job) {
  return (
    approvalGroup(job) !== null &&
    (job.snapshot as Record<string, unknown>).index !== 0 &&
    !(await groupApproved(tx, job))
  );
}
export async function approveJob(
  user: { id: string; role: string },
  id: string,
) {
  demand(
    user.role !== "OBSERVER",
    "Observador solo puede ver y descargar.",
    403,
  );
  const job = await db.generationJob.findUnique({
    where: { id },
    include: { variation: true },
  });
  demand(
    job?.status === "COMPLETED" && job.variation,
    "Primero genera una muestra completada.",
    409,
  );
  demand(
    user.role === "OWNER" || job.actorId === user.id,
    "Solo el autor u OWNER puede aprobar el trabajo.",
    403,
  );
  if (job.projectId === "connection-test") ownerOnly(user);
  else await jobResourceAccess(user, job, "EDIT");
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(728291)`;
    const v = await tx.variation.findUniqueOrThrow({
      where: { id: job.variation!.id },
    });
    demand(
      !v.deletedAt && !v.expired && (v.permanent || v.expiresAt > new Date()),
      "La imagen ya no está disponible.",
      410,
    );
    await tx.variation.update({
      where: { id: v.id },
      data: { reviewStatus: "APPROVED", permanent: true },
    });
    await tx.libraryItem.upsert({
      where: { userId_variationId: { userId: user.id, variationId: v.id } },
      create: { userId: user.id, variationId: v.id },
      update: {},
    });
    await recordActivity(tx, {
      data: { actorId: user.id, action: "MUESTRA_APROBADA", resourceId: v.id },
    });
    const group = approvalGroup(job);
    const pending = group
      ? await tx.generationJob.findMany({
          where: {
            actorId: job.actorId,
            status: "PENDING",
            snapshot: { path: ["approvalGroup"], equals: group },
          },
          select: { id: true },
          take: 200,
        })
      : [];
    return { approved: true, pending: pending.map((j) => j.id) };
  });
}

/** Skip held jobs at the queue head, so unrelated projects continue normally. */
export async function nextRunnableId(filter?: {
  id?: string;
  actorId?: string;
}) {
  const { Prisma } = await import("@prisma/client");
  const rows = await db.$queryRaw<{ id: string }[]>(Prisma.sql`
 SELECT j.id FROM "GenerationJob" j WHERE j.status='PENDING'
 AND (${filter?.id ?? null}::text IS NULL OR j.id=${filter?.id ?? null})
 AND (${filter?.actorId ?? null}::text IS NULL OR j."actorId"=${filter?.actorId ?? null})
 AND (j.snapshot->>'previewFirst' IS DISTINCT FROM 'true' OR j.snapshot->>'index'='0' OR EXISTS (
 SELECT 1 FROM "GenerationJob" f JOIN "Variation" v ON v."jobId"=f.id
 WHERE f."actorId"=j."actorId" AND f.snapshot->>'previewFirst'='true'
 AND f.snapshot->>'approvalGroup'=j.snapshot->>'approvalGroup' AND f.snapshot->>'index'='0'
 AND f.status='COMPLETED' AND v."reviewStatus"='APPROVED' AND v."deletedAt" IS NULL AND v.expired=false))
 ORDER BY j."createdAt",j.id LIMIT 1`);
  return rows[0]?.id ?? null;
}
