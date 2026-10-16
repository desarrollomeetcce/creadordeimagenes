import { db } from "./db";
import { cleanupStorage } from "./cleanup";
import { recoverInterrupted } from "../scripts/worker";
import { recordActivity } from "./activity";
import { demand, AppError } from "./errors";

export type MaintenanceSource = "MANUAL" | "CRON" | "WORKER" | "CLI";
export const cronConfigured = () =>
  !!process.env.CRON_SECRET && process.env.CRON_SECRET.length >= 32;
const staleBefore = (now: Date) => new Date(now.getTime() - 15 * 60000);
const runSelect = {
  id: true,
  source: true,
  status: true,
  startedAt: true,
  finishedAt: true,
  result: true,
  error: true,
} as const;
export async function maintenanceStatus() {
  const now = new Date();
  const [runs, variations, queuedFiles, thumbnails, interrupted, automatic] =
    await Promise.all([
      db.maintenanceRun.findMany({
        orderBy: { startedAt: "desc" },
        take: 10,
        select: runSelect,
      }),
      db.variation.count({
        where: {
          permanent: false,
          filesQueuedAt: null,
          expiresAt: { lte: now },
        },
      }),
      db.assetDeletion.count(),
      db.auditThumbnail.count({
        where: { status: "AVAILABLE", expiresAt: { lte: now } },
      }),
      db.generationJob.count({
        where: { status: "RUNNING", startedAt: { lt: staleBefore(now) } },
      }),
      db.maintenanceRun.findFirst({
        where: { source: "CRON", status: { in: ["COMPLETED", "PARTIAL"] } },
        orderBy: { startedAt: "desc" },
        select: { finishedAt: true },
      }),
    ]);
  return {
    host: process.env.VERCEL ? "VERCEL" : "SERVER",
    cronConfigured: cronConfigured(),
    lastAutomaticAt: automatic?.finishedAt ?? null,
    pending: { variations, queuedFiles, thumbnails, interrupted },
    runs: runs.map((run) => ({
      ...run,
      result: Object.fromEntries(
        [
          "expired",
          "thumbnails",
          "deletedFiles",
          "failedFiles",
          "interrupted",
        ].map((key) => [
          key,
          Number((run.result as Record<string, unknown> | null)?.[key]) || 0,
        ]),
      ),
    })),
  };
}
export async function runMaintenance(
  source: MaintenanceSource,
  actorId = "system:maintenance",
) {
  const now = new Date();
  const run = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(885303)`;
    await tx.maintenanceRun.updateMany({
      where: { status: "RUNNING", startedAt: { lt: staleBefore(now) } },
      data: {
        status: "INTERRUPTED",
        finishedAt: now,
        error:
          "No se confirmó el final de esta ejecución. Los archivos pendientes se vuelven a comprobar sin generar afiches.",
      },
    });
    demand(
      !(await tx.maintenanceRun.findFirst({ where: { status: "RUNNING" } })),
      "Ya hay un mantenimiento en curso. Actualiza su estado en unos momentos.",
      409,
    );
    return tx.maintenanceRun.create({ data: { source } });
  });
  try {
    const result = {
      ...(await cleanupStorage()),
      interrupted: await recoverInterrupted(),
    };
    const status = result.failedFiles ? "PARTIAL" : "COMPLETED";
    await db.$transaction(async (tx) => {
      await tx.maintenanceRun.update({
        where: { id: run.id },
        data: { status, finishedAt: new Date(), result },
      });
      await recordActivity(tx, {
        data: {
          actorId,
          action: "MANTENIMIENTO_COMPLETADO",
          resourceId: run.id,
          detail: { ...result, count: result.expired },
        },
      });
    });
    return { id: run.id, status, ...result };
  } catch {
    await db.maintenanceRun
      .update({
        where: { id: run.id },
        data: {
          status: "FAILED",
          finishedAt: new Date(),
          error:
            "No se pudo completar el mantenimiento. Los archivos pendientes se conservan en la cola para volver a comprobarlos.",
        },
      })
      .catch(() => {});
    throw new AppError(
      "No se pudo completar el mantenimiento. Consulta el estado e inténtalo más tarde; no se genera ni se cobra IA.",
      503,
    );
  }
}
