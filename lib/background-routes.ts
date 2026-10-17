import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { start, getRun } from "workflow/api";
import { generateBatchInBackground } from "../workflows/generate-batch";
import { db } from "./db";
import { demand } from "./errors";
import {
  backgroundAvailable,
  prepareBackground,
  pauseBackground,
  batchAccess,
  activeBatchStates,
} from "./background";

export async function backgroundRoutes(
  req: NextRequest,
  parts: string[],
  user: { id: string; role: string },
  body: () => Promise<unknown>,
) {
  const send = (value: unknown, status = 200) =>
    NextResponse.json(value, {
      status,
      headers: { "Cache-Control": "no-store" },
    });
  if (parts.length === 2 && req.method === "GET") {
    const batches = await db.backgroundBatch.findMany({
      where: { actorId: user.id },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
    const ids = batches.flatMap((b) => b.jobIds as string[]);
    const jobs = await db.generationJob.findMany({
      where: { id: { in: ids } },
      select: { id: true, status: true },
    });
    const states = new Map(jobs.map((j) => [j.id, j.status]));
    return send({
      available: backgroundAvailable(),
      batches: batches.map((b) => {
        const statuses = (b.jobIds as string[]).map((id) => states.get(id));
        return {
          id: b.id,
          status: b.status,
          error: b.error,
          createdAt: b.createdAt,
          total: statuses.length,
          completed: statuses.filter((s) => s === "COMPLETED").length,
          pending: statuses.filter((s) => s === "PENDING").length,
          pendingIds: (b.jobIds as string[]).filter(
            (id) => states.get(id) === "PENDING",
          ),
          running: statuses.filter((s) => s === "RUNNING").length,
          cancelled: statuses.filter((s) => s === "CANCELLED").length,
          uncertain: statuses.filter((s) => s === "UNCERTAIN").length,
          failed: statuses.filter((s) => s === "FAILED").length,
        };
      }),
    });
  }
  if (parts.length === 2 && req.method === "POST") {
    const b = z
      .object({
        ids: z.array(z.string().min(1)).min(1).max(200),
        requestId: z.uuid(),
      })
      .parse(await body());
    const { batch, created } = await prepareBackground(
      user,
      b.ids,
      b.requestId,
    );
    if (!created) return send({ id: batch.id, status: batch.status }, 200);
    try {
      const run = await start(generateBatchInBackground, [batch.id]);
      await db.backgroundBatch.updateMany({
        where: { id: batch.id, runId: null, status: "STARTING" },
        data: { runId: run.runId, status: "ACTIVE" },
      });
    } catch {
      await db.backgroundBatch.updateMany({
        where: { id: batch.id, runId: null, status: "STARTING" },
        data: {
          status: "DISPATCH_UNCERTAIN",
          error:
            "No se pudo confirmar el envío al ejecutor. No se ha repetido la solicitud. Actualiza el estado o solicita la pausa antes de programar otro lote.",
        },
      });
    }
    const current = await db.backgroundBatch.findUniqueOrThrow({
      where: { id: batch.id },
    });
    return send({ id: current.id, status: current.status }, 202);
  }
  if (parts[2] && parts.length === 4 && req.method === "POST") {
    if (parts[3] === "cancel-pending") {
      const { cancelBatchPending } = await import("./job-management");
      return send(await cancelBatchPending(user, parts[2]));
    }
    if (parts[3] === "pause")
      return send(await pauseBackground(user, parts[2]));
    if (parts[3] === "check") {
      const batch = await batchAccess(user, parts[2]);
      if (batch.runId && activeBatchStates.includes(batch.status)) {
        let status: string;
        try {
          status = await getRun(batch.runId).status;
        } catch {
          return send({
            status: batch.status,
            message:
              "No se pudo consultar el ejecutor. No se ha reenviado ni reintentado ningún trabajo.",
          });
        }
        if (["completed", "failed", "cancelled"].includes(status)) {
          const pending = await db.generationJob.count({
            where: {
              id: { in: batch.jobIds as string[] },
              status: { notIn: ["COMPLETED", "CANCELLED"] },
            },
          });
          await db.backgroundBatch.updateMany({
            where: { id: batch.id, status: batch.status },
            data: {
              status: !pending
                ? "COMPLETED"
                : batch.status === "PAUSING"
                  ? "PAUSED"
                  : "NEEDS_REVIEW",
              error:
                pending && batch.status !== "PAUSING"
                  ? "La ejecución se detuvo. Revisa los trabajos y cualquier cargo incierto antes de continuar."
                  : null,
            },
          });
        }
      }
      return send({
        status: (
          await db.backgroundBatch.findUniqueOrThrow({
            where: { id: batch.id },
          })
        ).status,
      });
    }
  }
  demand(false, "Operación de lote no encontrada.", 404);
}
