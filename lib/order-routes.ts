import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { start, getRun } from "workflow/api";
import { randomUUID } from "node:crypto";
import { generateOrder } from "../workflows/generate-order";
import { db } from "./db";
import { demand } from "./errors";
import {
  registerOrders,
  orderAccess,
  orderSummary,
  pauseOrder,
  stopOrder,
  approveOrder,
  orderTick,
} from "./generation-orders";
type Actor = { id: string; role: string };
export async function launchOrder(user: Actor, id: string, resume = false) {
  const { order, jobs } = await orderAccess(user, id);
  if (!resume && order.status !== "QUEUED") return;
  if (
    resume &&
    order.status === "ACTIVE" &&
    (jobs[0].snapshot as Record<string, unknown>).executionMode === "immediate"
  )
    return;
  if (resume)
    demand(
      ["PAUSED", "REVIEW", "QUEUED"].includes(order.status),
      "Revisa la orden antes de reanudar. No se repiten solicitudes de cargo incierto.",
      409,
    );
  const mode = String(
    (jobs[0].snapshot as Record<string, unknown>).executionMode,
  );
  const claimed = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(728291)`;
    const result = await tx.generationOrder.updateMany({
      where: { id, status: order.status },
      data: {
        status: mode === "immediate" ? "ACTIVE" : "STARTING",
        runId: mode === "immediate" ? "interactive:" + randomUUID() : null,
        error: null,
      },
    });
    return result.count > 0;
  });
  if (!claimed) return;
  if (mode === "immediate") return;
  try {
    const run = await start(generateOrder, [id]);
    await db.generationOrder.updateMany({
      where: { id, status: "STARTING", runId: null },
      data: { runId: run.runId, status: "ACTIVE" },
    });
  } catch {
    await db.generationOrder.updateMany({
      where: { id, status: "STARTING", runId: null },
      data: {
        status: "DISPATCH_UNCERTAIN",
        error:
          "Envío sin confirmar. Comprueba el ejecutor; no se repetirá automáticamente.",
      },
    });
  }
}
export async function orderRoutes(
  req: NextRequest,
  parts: string[],
  user: Actor,
  body: () => Promise<unknown>,
) {
  const send = (b: unknown, status = 200) =>
    NextResponse.json(b, { status, headers: { "Cache-Control": "no-store" } });
  if (parts.length === 1 && req.method === "POST") {
    const b = z
      .object({
        ids: z.array(z.string().min(1)).min(1).max(1000),
        mode: z.enum(["background", "user-queue", "system-queue", "immediate"]),
        requestId: z.uuid(),
      })
      .parse(await body());
    const ids = await registerOrders(user, b.ids, b.mode, b.requestId);
    for (const id of ids) await launchOrder(user, id);
    return send({ orders: ids }, 202);
  }
  if (parts.length === 1 && req.method === "GET") {
    const ids = z
      .array(z.string().min(1).max(120))
      .max(100)
      .parse(
        (req.nextUrl.searchParams.get("ids") ?? "").split(",").filter(Boolean),
      );
    if (!ids.length) {
      const { hierarchyScope } = await import("./hierarchy-filters");
      const scope = await hierarchyScope(user, req.nextUrl.searchParams);
      const where = {
        AND: [
          scope.where,
          user.role === "OWNER"
            ? {
                OR: [
                  scope.access ?? { id: "" },
                  { projectId: "connection-test" },
                ],
              }
            : (scope.access ?? { id: "" }),
        ],
      };
      return send(
        (
          await (await import("./generation-orders")).libraryOrders(user, where)
        ).filter((o) => o.canManage),
      );
    }
    return send(
      await Promise.all(
        ids.map(async (id) => {
          const { order, jobs } = await orderAccess(user, id, false);
          const sub = jobs[0].subproductId
            ? await db.subproduct.findUnique({
                where: { id: jobs[0].subproductId },
                select: { name: true, categoryId: true },
              })
            : null;
          return {
            ...orderSummary(order, jobs, user),
            name: sub?.name ?? "Prueba de imagen",
            scope: {
              project:
                jobs[0].projectId === "connection-test"
                  ? "none"
                  : jobs[0].projectId,
              product: sub?.categoryId ?? "",
              subproduct: jobs[0].subproductId ?? "",
            },
          };
        }),
      ),
    );
  }
  demand(
    parts.length === 3 && req.method === "POST",
    "Operación de orden no encontrada.",
    404,
  );
  const id = parts[1],
    action = parts[2];
  if (action === "pause") await pauseOrder(user, id);
  else if (action === "stop" || action === "finish") {
    const b = z
      .object({ expectedCompleted: z.number().int().min(1).optional() })
      .parse(await body());
    await stopOrder(user, id, action === "finish", b.expectedCompleted);
  } else if (action === "resume") await launchOrder(user, id, true);
  else if (action === "approve") {
    const b = z.object({ jobId: z.string().min(1) }).parse(await body());
    await approveOrder(user, id, b.jobId);
    const { order } = await orderAccess(user, id);
    // The execution mode was selected at the source. Approval only releases this order.
    if (order.status === "REVIEW") await launchOrder(user, id, true);
  } else if (action === "process") {
    const { order, jobs } = await orderAccess(user, id);
    demand(
      (jobs[0].snapshot as Record<string, unknown>).executionMode ===
        "immediate",
      "Esta orden utiliza su ejecutor en segundo plano.",
      409,
    );
    demand(order.runId, "La orden todavía no se inició.", 409);
    return send({ result: await orderTick(id, order.runId) });
  } else if (action === "check") {
    const { order } = await orderAccess(user, id);
    if (
      order.runId &&
      !order.runId.startsWith("interactive:") &&
      ["STARTING", "ACTIVE", "DISPATCH_UNCERTAIN"].includes(order.status)
    ) {
      const state = await getRun(order.runId).status;
      if (["completed", "failed", "cancelled"].includes(state))
        await db.generationOrder.updateMany({
          where: { id, status: order.status, runId: order.runId },
          data: {
            status: "NEEDS_REVIEW",
            error:
              "El ejecutor terminó. Revisa los resultados antes de autorizar una continuación.",
          },
        });
    }
  } else demand(false, "Operación no encontrada.", 404);
  const { order, jobs } = await orderAccess(user, id, false);
  return send(orderSummary(order, jobs, user));
}
