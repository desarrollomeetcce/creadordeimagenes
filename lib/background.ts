import { recordActivity } from "./activity";
import { db } from "./db";
import { projectAccess, jobResourceAccess } from "./auth";
import { demand, AppError } from "./errors";
import { configured } from "./ai";
import { processJob } from "./jobs";
import { recoverInterrupted } from "../scripts/worker";

export const activeBatchStates = [
  "STARTING",
  "ACTIVE",
  "PAUSING",
  "DISPATCH_UNCERTAIN",
];
export function backgroundAvailable() {
  if (process.env.VERCEL)
    return (
      !!process.env.VERCEL_DEPLOYMENT_ID && !process.env.WORKFLOW_TARGET_WORLD
    );
  return process.env.WORKFLOW_TARGET_WORLD === "local";
}
export async function batchAccess(
  user: { id: string; role: string },
  id: string,
) {
  const batch = await db.backgroundBatch.findUnique({ where: { id } });
  demand(
    batch && (batch.actorId === user.id || user.role === "OWNER"),
    "Lote no encontrado.",
    404,
  );
  return batch;
}
export async function prepareBackground(
  user: { id: string; role: string },
  ids: string[],
  requestId: string,
) {
  demand(
    backgroundAvailable(),
    "La ejecución en segundo plano aún no está disponible en este servidor. Puedes usar el procesamiento interactivo.",
    503,
  );
  const jobIds = [...new Set(ids)].sort();
  demand(
    jobIds.length > 0 && jobIds.length <= 200,
    "Selecciona entre 1 y 200 trabajos pendientes.",
  );
  const requestKey = `${user.id}:${requestId}`;
  const prior = await db.backgroundBatch.findUnique({ where: { requestKey } });
  if (prior) {
    demand(
      JSON.stringify(prior.jobIds) === JSON.stringify(jobIds),
      "Esta solicitud ya se utilizó para otros trabajos.",
      409,
    );
    return { batch: prior, created: false };
  }
  const jobs = await db.generationJob.findMany({
    where: { id: { in: jobIds } },
  });
  demand(jobs.length === jobIds.length, "Hay trabajos no disponibles.", 404);
  for (const job of jobs) {
    demand(
      job.actorId === user.id || user.role === "OWNER",
      "Solo puedes programar tus propios trabajos.",
      403,
    );
    demand(
      job.status === "PENDING",
      "Solo se programan trabajos pendientes; los cargos inciertos requieren revisión manual.",
      409,
    );
    if (job.projectId === "connection-test")
      demand(user.role === "OWNER", "Operación exclusiva del OWNER.", 403);
    else
      await jobResourceAccess(
        user,
        job,
        typeof (job.snapshot as Record<string, unknown>).editVariationId ===
          "string"
          ? "EDIT"
          : "GENERATE",
      );
  }
  await configured();
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(728292)`;
    const existing = await tx.backgroundBatch.findUnique({
      where: { requestKey },
    });
    if (existing) {
      demand(
        JSON.stringify(existing.jobIds) === JSON.stringify(jobIds),
        "Esta solicitud ya se utilizó para otros trabajos.",
        409,
      );
      return { batch: existing, created: false };
    }
    demand(
      !(await tx.backgroundBatch.findFirst({
        where: { actorId: user.id, status: { in: activeBatchStates } },
      })),
      "Ya tienes un lote activo. Espera o solicita su pausa antes de programar otro.",
      409,
    );
    const batch = await tx.backgroundBatch.create({
      data: { actorId: user.id, requestKey, jobIds },
    });
    await recordActivity(tx, {
      data: {
        actorId: user.id,
        action: "LOTE_SEGUNDO_PLANO_AUTORIZADO",
        resourceId: batch.id,
        detail: { count: jobIds.length },
      },
    });
    return { batch, created: true };
  });
}
export async function pauseBackground(
  user: { id: string; role: string },
  id: string,
) {
  await batchAccess(user, id);
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "BackgroundBatch" WHERE id=${id} FOR UPDATE`;
    const batch = await tx.backgroundBatch.findUniqueOrThrow({ where: { id } });
    if (!activeBatchStates.includes(batch.status))
      return { status: batch.status };
    const status = batch.runId ? "PAUSING" : "PAUSED";
    await tx.backgroundBatch.update({ where: { id }, data: { status } });
    await recordActivity(tx, {
      data: {
        actorId: user.id,
        action: "LOTE_PAUSA_SOLICITADA",
        resourceId: id,
      },
    });
    return { status };
  });
}
export async function backgroundTick(
  batchId: string,
  runId: string,
): Promise<"CONTINUE" | "WAIT" | "STOP"> {
  const batch = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "BackgroundBatch" WHERE id=${batchId} FOR UPDATE`;
    const current = await tx.backgroundBatch.findUnique({
      where: { id: batchId },
    });
    if (
      !current ||
      !activeBatchStates.includes(current.status) ||
      (current.runId && current.runId !== runId)
    )
      return null;
    if (current.status === "PAUSING") {
      await tx.backgroundBatch.update({
        where: { id: batchId },
        data: { status: "PAUSED" },
      });
      return null;
    }
    return tx.backgroundBatch.update({
      where: { id: batchId },
      data: { runId, status: "ACTIVE", error: null },
    });
  });
  if (!batch) return "STOP";
  try {
    const user = await db.user.findUnique({ where: { id: batch.actorId } });
    demand(
      user?.status === "APPROVED",
      "La cuenta que autorizó el lote ya no está aprobada.",
      403,
    );
    await recoverInterrupted();
    const ids = batch.jobIds as string[];
    const jobs = await db.generationJob.findMany({
      where: { id: { in: ids } },
      select: { id: true, status: true },
    });
    demand(
      jobs.length === ids.length,
      "Se eliminó un trabajo del lote. Revisa los pendientes.",
      409,
    );
    demand(
      !jobs.some((j) => j.status === "FAILED" || j.status === "UNCERTAIN"),
      "El lote se detuvo: hay un trabajo fallido o un cargo incierto que requiere revisión.",
      409,
    );
    if (jobs.some((j) => j.status === "RUNNING")) return "WAIT";
    const pending = ids
      .map((id) => jobs.find((j) => j.id === id))
      .find((j) => j?.status === "PENDING");
    if (!pending) {
      await db.backgroundBatch.updateMany({
        where: { id: batchId, runId, status: { in: ["ACTIVE", "PAUSING"] } },
        data: { status: "COMPLETED" },
      });
      return "STOP";
    }
    // processJob rechecks the initiator and original actor before the only paid attempt.
    const result = await processJob(user, pending.id);
    demand(
      result.status === "COMPLETED",
      result.error || "El trabajo requiere revisión antes de continuar.",
      409,
    );
    return "CONTINUE";
  } catch (error) {
    // Another processor can win the job claim. Waiting never creates a new attempt.
    if (error instanceof AppError && error.status === 409) {
      const jobs = await db.generationJob.findMany({
        where: { id: { in: batch.jobIds as string[] } },
        select: { actorId: true, status: true },
      });
      if (!jobs.some((j) => ["FAILED", "UNCERTAIN"].includes(j.status))) {
        const running = await db.generationJob.count({
          where: {
            actorId: { in: jobs.map((j) => j.actorId) },
            status: "RUNNING",
          },
        });
        if (running) return "WAIT";
        if (jobs.every((j) => ["COMPLETED", "CANCELLED"].includes(j.status)))
          return "CONTINUE";
      }
    }
    await db.backgroundBatch.updateMany({
      where: { id: batchId, runId, status: { in: ["ACTIVE", "PAUSING"] } },
      data: {
        status: "NEEDS_REVIEW",
        error:
          error instanceof AppError
            ? error.message
            : "Se interrumpió la ejecución del lote. Revisa sus trabajos antes de continuar.",
      },
    });
    return "STOP";
  }
}
