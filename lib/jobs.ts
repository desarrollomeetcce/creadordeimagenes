import { recordActivity } from "./activity";
import { db } from "./db";
import { demand } from "./errors";
import { configured, reserveJobs } from "./ai";
import { projectAccess, jobResourceAccess, ownerOnly } from "./auth";
export async function cancelJob(
  user: { id: string; role: string },
  id: string,
) {
  const job = await db.generationJob.findUnique({ where: { id } });
  demand(job, "Trabajo no encontrado.", 404);
  if (job.projectId === "connection-test") ownerOnly(user);
  else await jobResourceAccess(user, job, "GENERATE");
  demand(
    user.role === "OWNER" || job.actorId === user.id,
    "Solo puedes cancelar tus propios trabajos.",
    403,
  );
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(728291)`;
    const changed = await tx.generationJob.updateMany({
      where: { id, status: "PENDING" },
      data: { status: "CANCELLED", completedAt: new Date() },
    });
    demand(
      changed.count,
      "Solo se pueden cancelar trabajos que aún están pendientes.",
      409,
    );
    await tx.usageLedger.update({
      where: { jobId: id },
      data: { status: "RELEASED" },
    });
    await recordActivity(tx, {
      data: { actorId: user.id, action: "TRABAJO_CANCELADO", resourceId: id },
    });
    return { ok: true };
  });
}
export async function processJob(
  user: { id: string; role: string },
  id: string,
) {
  const job = await db.generationJob.findUnique({ where: { id } });
  demand(job, "Trabajo no encontrado.", 404);
  demand(
    user.role === "OWNER" || job.actorId === user.id,
    "Solo puedes procesar tus propios trabajos.",
    403,
  );
  if (job.projectId === "connection-test") ownerOnly(user);
  else
    await jobResourceAccess(
      user,
      job,
      typeof (job.snapshot as Record<string, unknown>).editVariationId ===
        "string"
        ? "EDIT"
        : "GENERATE",
    );
  demand(
    job.status === "PENDING",
    "El trabajo ya fue procesado o está en curso. Actualiza su estado.",
    409,
  );
  demand(
    !(await (await import("./preview-approval")).waitingForApproval(db, job)),
    "Aprueba la primera muestra antes de generar las demás variaciones.",
    409,
  );
  await configured();
  const { runOne, recoverInterrupted } = await import("../scripts/worker");
  await recoverInterrupted();
  const processed = await runOne({
    id,
    actorId: job.actorId,
    deadlineMs: 240000,
  });
  demand(
    processed,
    "Ya hay un trabajo en curso para esta cuenta. Espera a que termine.",
    409,
  );
  const result = await db.generationJob.findUniqueOrThrow({ where: { id } });
  return { id, status: result.status, error: result.error };
}
export async function retryJob(
  user: { id: string; role: string },
  id: string,
  requestId: string,
  confirmUncertain: boolean,
) {
  const job = await db.generationJob.findUnique({ where: { id } });
  demand(job, "Trabajo no encontrado.", 404);
  demand(
    !job.archivedAt,
    "Restaura el trabajo en el listado antes de reintentarlo.",
    409,
  );
  if (job.projectId === "connection-test") ownerOnly(user);
  else await jobResourceAccess(user, job, "GENERATE");
  demand(
    user.role === "OWNER" || job.actorId === user.id,
    "Solo puedes reintentar tus propios trabajos.",
    403,
  );
  demand(
    ["FAILED", "UNCERTAIN", "CANCELLED"].includes(job.status),
    "Este trabajo no admite un nuevo intento.",
  );
  demand(
    job.status !== "UNCERTAIN" || confirmUncertain,
    "La llamada anterior pudo producir un cargo. Debes reconocer ese riesgo antes de otro intento.",
  );
  const c = await configured();
  const snapshot = job.snapshot as Record<string, unknown>;
  if (typeof snapshot.editVariationId === "string")
    await jobResourceAccess(user, job, "EDIT");
  return reserveJobs(
    user.id,
    job.projectId,
    [
      {
        subproductId: job.subproductId ?? undefined,
        key: `retry:${user.id}:${id}:${requestId}`,
        snapshot: { ...snapshot, retryOf: id },
      },
    ],
    c.revision,
  );
}
