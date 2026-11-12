import { z } from "zod";
import { db } from "./db";
import { demand } from "./errors";
import { configured, reserveJobs } from "./ai";
import { orderAccess } from "./generation-orders";
import { jobResourceAccess } from "./auth";
import { recordActivity } from "./activity";
import { hasAiModuleAccess } from "./roles";
import { compatibleImageOverrides } from "./project-image-settings";
import type { ModelCapability } from "./providers";

export const orderRetrySchema = z
  .object({
    requestId: z.uuid(),
    expectedVersion: z.iso.datetime(),
    confirmCharge: z.literal(true),
  })
  .strict();

export function retrySnapshot(
  source: Record<string, unknown>,
  capability: ModelCapability,
  originalId: string,
  requestId: string,
): Record<string, unknown> & { retryOf: string; retryRequestId: string } {
  const next = { ...source };
  for (const key of [
    "creativePlan",
    "creativeRecovery",
    "creativeUnavailable",
    "literalCopy",
    "renderedMode",
    "orderFinalCount",
    "imageQuality",
    "imageResolution",
  ])
    delete next[key];
  const options = compatibleImageOverrides(
    {
      quality:
        typeof source.imageQuality === "string"
          ? source.imageQuality
          : undefined,
      resolution:
        typeof source.imageResolution === "string"
          ? source.imageResolution
          : undefined,
    },
    capability,
  );
  return {
    ...next,
    retryOf: originalId,
    retryRequestId: requestId,
    ...(options.quality ? { imageQuality: options.quality } : {}),
    ...(options.resolution ? { imageResolution: options.resolution } : {}),
  };
}

/** Explicit new attempts. Old uncertain jobs and their financial history never change. */
export async function retryOrder(
  actor: { id: string; role: string },
  id: string,
  input: unknown,
) {
  const b = orderRetrySchema.parse(input);
  const { order, jobs } = await orderAccess(actor, id);
  const prefix = "order-retry:" + id + ":" + b.requestId + ":";
  const configuration = await configured();
  const capability = (configuration.models as ModelCapability[]).find(
    (m) => m.id === configuration.imageModel && m.kind === "image",
  )!;
  const owner = await db.user.findUniqueOrThrow({
    where: { id: order.actorId },
  });
  const checkedScopes = new Set<string>();
  for (const job of jobs.filter((j) =>
    ["PENDING", "FAILED", "UNCERTAIN"].includes(j.status),
  )) {
    const permission =
      typeof (job.snapshot as Record<string, unknown>).editVariationId ===
      "string"
        ? "EDIT"
        : "GENERATE";
    const scope =
      job.projectId + ":" + (job.subproductId ?? "") + ":" + permission;
    if (checkedScopes.has(scope)) continue;
    checkedScopes.add(scope);
    if (actor.id === owner.id) await jobResourceAccess(actor, job, permission);
    else
      await Promise.all([
        jobResourceAccess(actor, job, permission),
        jobResourceAccess(owner, job, permission),
      ]);
  }
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(728291)`;
      await tx.$queryRaw`SELECT id FROM "GenerationOrder" WHERE id=${id} FOR UPDATE`;
      const user = await tx.user.findUnique({ where: { id: actor.id } });
      demand(
        user?.status === "APPROVED" &&
          !user.archivedAt &&
          hasAiModuleAccess(user) &&
          user.role !== "OBSERVER" &&
          (user.id === order.actorId || user.role === "OWNER"),
        "La cuenta ya no puede reintentar esta orden.",
        403,
      );
      const current = await tx.generationOrder.findUniqueOrThrow({
        where: { id },
      });
      if (
        await tx.generationJob.findFirst({
          where: { idempotencyKey: { startsWith: prefix } },
          select: { id: true },
        })
      )
        return { changed: false };
      demand(
        ["NEEDS_REVIEW", "PAUSED"].includes(current.status) &&
          current.updatedAt.toISOString() === b.expectedVersion,
        "La orden cambió. Actualiza su estado antes de reintentar.",
        409,
      );
      const fresh = await tx.generationJob.findMany({
        where: { id: { in: current.jobIds as string[] } },
        include: { variation: { select: { id: true } } },
      });
      demand(
        !fresh.some((j) => j.status === "RUNNING"),
        "Espera a que termine la imagen en curso.",
        409,
      );
      demand(
        fresh.some((j) => ["FAILED", "UNCERTAIN"].includes(j.status)),
        "No hay imágenes fallidas o inciertas para reintentar. Usa Reanudar para lo pendiente.",
        409,
      );
      const sources = fresh.filter((j) =>
        ["PENDING", "FAILED", "UNCERTAIN"].includes(j.status),
      );
      const positions = new Map(
        (current.jobIds as string[]).map((jobId, index) => [jobId, index]),
      );
      sources.sort((a, b) => {
        const priority = (job: typeof a) => {
          const snapshot = job.snapshot as Record<string, unknown>;
          return snapshot.previewFirst === true && snapshot.index === 0 ? 0 : 1;
        };
        return (
          priority(a) - priority(b) ||
          (positions.get(a.id) ?? 0) - (positions.get(b.id) ?? 0)
        );
      });
      demand(
        sources.every((j) => !j.archivedAt && !j.variation),
        "Revisa los intentos archivados o con una imagen guardada antes de reintentar.",
        409,
      );
      demand(
        sources.every(
          (j) =>
            j.projectId === sources[0].projectId &&
            j.subproductId === sources[0].subproductId,
        ),
        "La orden contiene ámbitos distintos.",
        409,
      );
      demand(
        sources.length <= configuration.maxGenerations,
        "La cantidad pendiente supera el límite actual por generación.",
        409,
      );
      const unstarted = sources
        .filter((j) => j.status === "PENDING")
        .map((j) => j.id);
      if (unstarted.length) {
        const ledgers = await tx.usageLedger.findMany({
          where: { jobId: { in: unstarted } },
        });
        demand(
          ledgers.length === unstarted.length &&
            ledgers.every(
              (l) =>
                l.status === "RESERVED" &&
                (l.actualMicros === null || l.actualMicros === 0n),
            ),
          "Una reserva pendiente requiere revisión.",
          409,
        );
        await tx.generationJob.updateMany({
          where: { id: { in: unstarted }, status: "PENDING" },
          data: { status: "CANCELLED", completedAt: new Date() },
        });
        await tx.usageLedger.updateMany({
          where: { jobId: { in: unstarted }, status: "RESERVED" },
          data: { status: "RELEASED" },
        });
      }
      const newJobs = await reserveJobs(
        current.actorId,
        sources[0].projectId,
        sources.map((job) => ({
          subproductId: job.subproductId ?? undefined,
          key: prefix + job.id,
          snapshot: {
            ...retrySnapshot(
              job.snapshot as Record<string, unknown>,
              capability,
              job.id,
              b.requestId,
            ),
            orderId: id,
          },
        })),
        configuration.revision,
        tx,
      );
      const replacements = new Map(
        sources.map((job, index) => [job.id, newJobs[index].id]),
      );
      await tx.generationOrder.update({
        where: { id },
        data: {
          jobIds: (current.jobIds as string[]).map(
            (jobId) => replacements.get(jobId) ?? jobId,
          ),
          status: "PAUSED",
          runId: null,
          error: null,
        },
      });
      await recordActivity(tx, {
        data: {
          actorId: actor.id,
          action: "ORDEN_REINTENTO_AUTORIZADO",
          resourceId: id,
          detail: {
            requestId: b.requestId,
            originalIds: sources.map((j) => j.id),
            newIds: newJobs.map((j) => j.id),
            acknowledgedUncertain: sources.some(
              (j) => j.status === "UNCERTAIN",
            ),
          },
        },
      });
      return { changed: true };
    },
    { timeout: 20000 },
  );
}
