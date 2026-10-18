import { dismissedOrders } from "./order-dismissal";
import { emptyStoppedOrder } from "./order-visibility";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { demand, AppError } from "./errors";
import { jobResourceAccess } from "./auth";
import { recordActivity } from "./activity";
import { waitingForApproval, approveJob } from "./preview-approval";
import { processJob } from "./jobs";
import { backgroundAvailable } from "./background";
type Actor = { id: string; role: string };
export type OrderMode =
  "background" | "user-queue" | "system-queue" | "immediate";
export const orderPrefix = "order:";
export const openOrderStates = [
  "QUEUED",
  "STARTING",
  "ACTIVE",
  "PAUSING",
  "PAUSED",
  "REVIEW",
  "DISPATCH_UNCERTAIN",
  "NEEDS_REVIEW",
];
export async function orderAccess(user: Actor, id: string, manage = true) {
  const order = await db.generationOrder.findUnique({ where: { id } });
  demand(
    order && order.requestKey.startsWith(orderPrefix),
    "Orden no encontrada.",
    404,
  );
  if (manage)
    demand(
      user.role !== "OBSERVER" &&
        (user.id === order.actorId || user.role === "OWNER"),
      "Solo el autor u OWNER puede controlar esta orden.",
      403,
    );
  const jobs = await db.generationJob.findMany({
    where: { id: { in: order.jobIds as string[] } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    include: {
      variation: {
        select: {
          id: true,
          reviewStatus: true,
          deletedAt: true,
          revision: true,
        },
      },
    },
  });
  demand(jobs.length, "La orden no contiene trabajos.", 404);
  for (const job of new Map(
    jobs.map((j) => [j.subproductId ?? j.projectId, j]),
  ).values()) {
    if (job.projectId === "connection-test")
      demand(user.role === "OWNER", "Pruebas exclusivas del OWNER.", 403);
    else await jobResourceAccess(user, job, manage ? "GENERATE" : "VIEW");
  }
  return { order, jobs };
}
export function orderSummary(
  order: {
    id: string;
    actorId: string;
    status: string;
    error: string | null;
    jobIds: unknown;
    createdAt: Date;
    updatedAt?: Date;
  },
  jobs: {
    id: string;
    status: string;
    snapshot: unknown;
    variation?: {
      id: string;
      reviewStatus: string;
      deletedAt: Date | null;
    } | null;
  }[],
  user: Actor,
) {
  const first = jobs[0]?.snapshot as Record<string, unknown> | undefined;
  const completed = jobs.filter(
    (j) => j.status === "COMPLETED" && !!j.variation && !j.variation.deletedAt,
  ).length;
  const closed = order.status === "ACCEPTED";
  return {
    id: order.id,
    viewerId: user.id,
    errorVersion: (order.updatedAt ?? order.createdAt).toISOString(),
    hiddenFromProduction: emptyStoppedOrder(order.status,jobs) ||
      (["COMPLETED","ACCEPTED"].includes(order.status) && !jobs.some(j=>["PENDING","RUNNING"].includes(j.status)) && !jobs.some(j=>j.variation&&!j.variation.deletedAt&&j.variation.reviewStatus!=="APPROVED")),
    canDismiss: user.role!=="OBSERVER" && (user.id===order.actorId||user.role==="OWNER") && ["COMPLETED","ACCEPTED","STOPPED","NEEDS_REVIEW"].includes(order.status) && !jobs.some(j=>["PENDING","RUNNING"].includes(j.status)),
    status: order.status,
    error: order.error,
    createdAt: order.createdAt,
    mode: String(first?.executionMode ?? "background"),
    requested: (order.jobIds as string[]).length,
    target: closed
      ? Number(first?.orderFinalCount ?? completed)
      : (order.jobIds as string[]).length,
    completed: closed ? Number(first?.orderFinalCount ?? completed) : completed,
    pending: jobs.filter((j) => j.status === "PENDING").length,
    running: jobs.filter((j) => j.status === "RUNNING").length,
    cancelled: jobs.filter((j) => j.status === "CANCELLED").length,
    uncertain: jobs.filter((j) => j.status === "UNCERTAIN").length,
    failed: jobs.filter((j) => j.status === "FAILED").length,
    canManage:
      user.role !== "OBSERVER" &&
      (user.id === order.actorId || user.role === "OWNER"),
    sampleJobId:
      jobs.find(
        (j) =>
          (j.snapshot as Record<string, unknown>).previewFirst === true &&
          (j.snapshot as Record<string, unknown>).index === 0,
      )?.id ?? null,
    sample:
      jobs.find(
        (j) =>
          (j.snapshot as Record<string, unknown>).previewFirst === true &&
          (j.snapshot as Record<string, unknown>).index === 0,
      )?.variation ?? null,
  };
}
export async function registerOrders(
  user: Actor,
  ids: string[],
  mode: OrderMode,
  requestId: string,
) {
  demand(
    user.role !== "OBSERVER",
    "Observador solo puede ver y descargar.",
    403,
  );
  const unique = [...new Set(ids)];
  demand(
    unique.length && unique.length <= 1000,
    "Selecciona entre 1 y 1000 trabajos.",
  );
  const jobs = await db.generationJob.findMany({
    where: { id: { in: unique } },
  });
  demand(jobs.length === unique.length, "Hay trabajos no disponibles.", 404);
  for (const job of jobs) {
    demand(
      user.id === job.actorId || user.role === "OWNER",
      "Solo el autor u OWNER puede programar estos trabajos.",
      403,
    );
    if (job.projectId === "connection-test")
      demand(user.role === "OWNER", "Pruebas exclusivas del OWNER.", 403);
    else await jobResourceAccess(user, job, "GENERATE");
  }
  if (mode !== "immediate")
    demand(
      backgroundAvailable(),
      "El ejecutor en segundo plano no está disponible. Elige ejecución inmediata.",
      503,
    );
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(728291)`;
    const groups = new Map<string, typeof jobs>();
    for (const j of jobs) {
      const key = j.subproductId ?? j.projectId;
      groups.set(key, [...(groups.get(key) ?? []), j]);
    }
    const result = [];
    for (const [scope, group] of groups) {
      const key = `order:${user.id}:${requestId}:${scope}`;
      const existing = await tx.generationOrder.findUnique({
        where: { requestKey: key },
      });
      if (existing) {
        demand(
          JSON.stringify([...(existing.jobIds as string[])].sort()) ===
            JSON.stringify(group.map((j) => j.id).sort()),
          "La solicitud pertenece a otra orden.",
          409,
        );
        result.push(existing.id);
        continue;
      }
      const fresh = await tx.generationJob.findMany({
        where: { id: { in: group.map((j) => j.id) } },
      });
      demand(
        fresh.every(
          (j) =>
            j.status === "PENDING" &&
            !(j.snapshot as Record<string, unknown>).orderId,
        ),
        "Estos trabajos ya están en una orden o fueron procesados. Abre su carpeta para controlarlos.",
        409,
      );
      const order = await tx.generationOrder.create({
        data: {
          actorId: user.id,
          requestKey: key,
          jobIds: group.map((j) => j.id),
          status: "QUEUED",
        },
      });
      for (const j of fresh)
        await tx.generationJob.update({
          where: { id: j.id },
          data: {
            snapshot: {
              ...(j.snapshot as Prisma.JsonObject),
              orderId: order.id,
              executionMode: mode,
            },
          },
        });
      await recordActivity(tx, {
        data: {
          actorId: user.id,
          action: "ORDEN_GENERACION_CREADA",
          resourceId: order.id,
          detail: {
            requested: group.length,
            mode,
            subproductId: group[0].subproductId,
          },
        },
      });
      result.push(order.id);
    }
    return result;
  });
}
export async function pauseOrder(user: Actor, id: string) {
  await orderAccess(user, id);
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(728291)`;
    await tx.$queryRaw`SELECT id FROM "GenerationOrder" WHERE id=${id} FOR UPDATE`;
    const order = await tx.generationOrder.findUniqueOrThrow({ where: { id } });
    if (["ACCEPTED", "COMPLETED", "STOPPED"].includes(order.status)) return;
    await tx.generationOrder.update({
      where: { id },
      data: { status: "PAUSED", error: null },
    });
    await recordActivity(tx, {
      data: { actorId: user.id, action: "ORDEN_PAUSADA", resourceId: id },
    });
  });
}
export async function stopOrder(
  user: Actor,
  id: string,
  finish = false,
  expectedCompleted?: number,
) {
  const { order } = await orderAccess(user, id);
  if (order.status === "ACCEPTED") {
    demand(finish, "Esta orden ya está finalizada.", 409);
    return;
  }
  if (!finish && order.status === "COMPLETED") return;
  const { stopSelectedJobs } = await import("./job-management");
  await pauseOrder(user, id);
  await stopSelectedJobs(user, order.jobIds as string[]);
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(728291)`;
    const jobs = await tx.generationJob.findMany({
      where: { id: { in: order.jobIds as string[] } },
      include: {
        variation: {
          select: {
            deletedAt: true,
            expired: true,
            expiresAt: true,
            permanent: true,
            id: true,
          },
        },
      },
    });
    demand(
      !finish || !jobs.some((j) => j.status === "RUNNING"),
      "Espera a que termine la imagen en curso antes de finalizar.",
      409,
    );
    const completed = jobs.filter(
      (j) =>
        j.status === "COMPLETED" && !!j.variation && !j.variation.deletedAt,
    ).length;
    demand(
      !finish ||
        expectedCompleted === undefined ||
        completed === expectedCompleted,
      "La orden avanzó mientras la revisabas. Actualiza y elige las imágenes que quieres conservar antes de finalizar.",
      409,
    );
    demand(
      !finish || completed > 0,
      "Todavía no hay imágenes terminadas para conservar.",
      409,
    );
    if (finish) {
      const available = jobs.filter(
        (j) =>
          j.status === "COMPLETED" && j.variation && !j.variation.deletedAt,
      );
      demand(
        available.every(
          (j) =>
            !j.variation!.expired &&
            (j.variation!.permanent || j.variation!.expiresAt > new Date()),
        ),
        "Una imagen ya caducó. Revisa las disponibles antes de finalizar.",
        409,
      );
      for (const j of available) {
        await tx.variation.update({
          where: { id: j.variation!.id },
          data: { reviewStatus: "APPROVED", permanent: true },
        });
        await tx.libraryItem.upsert({
          where: {
            userId_variationId: {
              userId: user.id,
              variationId: j.variation!.id,
            },
          },
          create: { userId: user.id, variationId: j.variation!.id },
          update: {},
        });
      }
    }
    if (finish)
      for (const j of jobs)
        await tx.generationJob.update({
          where: { id: j.id },
          data: {
            snapshot: {
              ...(j.snapshot as Prisma.JsonObject),
              orderFinalCount: completed,
            },
          },
        });
    await tx.generationOrder.update({
      where: { id },
      data: { status: finish ? "ACCEPTED" : "STOPPED", error: null },
    });
    await recordActivity(tx, {
      data: {
        actorId: user.id,
        action: finish ? "ORDEN_FINALIZADA_CON_RESULTADOS" : "ORDEN_DETENIDA",
        resourceId: id,
        detail: {
          requested: (order.jobIds as string[]).length,
          accepted: completed,
        },
      },
    });
  });
}
export async function approveOrder(user: Actor, id: string, jobId: string) {
  const { order, jobs } = await orderAccess(user, id);
  demand(
    (order.jobIds as string[]).includes(jobId),
    "La muestra no pertenece a esta orden.",
    404,
  );
  await approveJob(user, jobId);
}
export async function orderTick(
  id: string,
  runId: string,
): Promise<"CONTINUE" | "WAIT" | "STOP" | "REVIEW"> {
  const order = await db.generationOrder.findUnique({ where: { id } });
  if (
    !order ||
    !order.requestKey.startsWith(orderPrefix) ||
    !["STARTING", "ACTIVE"].includes(order.status) ||
    (order.runId && order.runId !== runId)
  )
    return "STOP";
  if (order.status === "STARTING") {
    const activated = await db.generationOrder.updateMany({
      where: { id, status: "STARTING", runId: order.runId },
      data: { status: "ACTIVE", runId },
    });
    if (!activated.count) return "STOP";
  }
  try {
    const actor = await db.user.findUnique({ where: { id: order.actorId } });
    demand(
      actor?.status === "APPROVED",
      "La cuenta de esta orden ya no está aprobada.",
      403,
    );
    const jobs = await db.generationJob.findMany({
      where: { id: { in: order.jobIds as string[] } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    if (jobs.some((j) => j.status === "RUNNING")) return "WAIT";
    if (jobs.some((j) => ["FAILED", "UNCERTAIN"].includes(j.status)))
      demand(
        false,
        "Hay una imagen fallida o un cargo incierto. Revisa la orden antes de continuar; no se reintentó.",
        409,
      );
    const pending = jobs.filter((j) => j.status === "PENDING");
    if (!pending.length) {
      await db.generationOrder.updateMany({
        where: { id, status: "ACTIVE", runId },
        data: {
          status: jobs.every((j) => j.status === "COMPLETED")
            ? "COMPLETED"
            : "STOPPED",
          error: null,
        },
      });
      return "STOP";
    }
    let next = null;
    for (const job of pending)
      if (!(await waitingForApproval(db, job))) {
        next = job;
        break;
      }
    if (!next) {
      await db.generationOrder.updateMany({
        where: { id, status: "ACTIVE", runId },
        data: { status: "REVIEW", error: null },
      });
      return "REVIEW";
    }
    const mode = (next.snapshot as Record<string, unknown>).executionMode;
    if (mode === "user-queue" || mode === "system-queue") {
      const earlier = await db.generationOrder.findMany({
        where: {
          requestKey: { startsWith: orderPrefix },
          status: { in: ["STARTING", "ACTIVE"] },
          OR: [
            { createdAt: { lt: order.createdAt } },
            { createdAt: order.createdAt, id: { lt: order.id } },
          ],
          ...(mode === "user-queue" ? { actorId: order.actorId } : {}),
        },
        select: { id: true, jobIds: true },
      });
      for (const other of earlier) {
        const eligible = await db.generationJob.findMany({
          where: { id: { in: other.jobIds as string[] }, status: "PENDING" },
        });
        for (const j of eligible)
          if (!(await waitingForApproval(db, j))) return "WAIT";
      }
    }
    const result = await processJob(actor, next.id, {
      batchId: id,
      runId,
      order: true,
    });
    demand(
      result.status === "COMPLETED",
      result.error ?? "Revisa la imagen antes de continuar.",
      409,
    );
    return "CONTINUE";
  } catch (error) {
    const current = await db.generationOrder.findUnique({ where: { id } });
    if (current?.status !== "ACTIVE" || current.runId !== runId) return "STOP";
    const modeJob = await db.generationJob.findUnique({
      where: { id: (order.jobIds as string[])[0] },
      select: { snapshot: true },
    });
    const system =
      (modeJob?.snapshot as Record<string, unknown>)?.executionMode ===
      "system-queue";
    const running = await db.generationJob.count({
      where: {
        status: "RUNNING",
        ...(system
          ? {}
          : {
              OR: [
                { actorId: order.actorId },
                {
                  snapshot: { path: ["executionMode"], equals: "system-queue" },
                },
              ],
            }),
      },
    });
    if (running) return "WAIT";
    await db.generationOrder.updateMany({
      where: { id, status: "ACTIVE", runId },
      data: {
        status: "NEEDS_REVIEW",
        error:
          error instanceof AppError
            ? error.message
            : "Revisa el estado de la orden antes de continuar.",
      },
    });
    return "STOP";
  }
}

/** Thin projections keep prompts and provider payloads out of explorer polling. */
export async function libraryOrders(
  user: Actor,
  where: Prisma.GenerationJobWhereInput,
) {
  const visible = await db.generationJob.findMany({
    where: {
      AND: [where, { snapshot: { path: ["orderId"], string_starts_with: "" } }],
    },
    select: { id: true },
    orderBy: { createdAt: "desc" },
    take: 3000,
  });
  if (!visible.length) return [];
  const records = await db.$queryRaw<
    {
      id: string;
      actorId: string;
      status: string;
      error: string | null;
      jobIds: string[];
      createdAt: Date;
      updatedAt: Date;
    }[]
  >`SELECT id,"actorId",status,error,"jobIds","createdAt","updatedAt" FROM "GenerationOrder" WHERE "requestKey" LIKE 'order:%' AND "jobIds" ?| ${visible.map((j) => j.id)}::text[] ORDER BY "createdAt" DESC,id DESC LIMIT 30`;
  if (!records.length) return [];
  const dismissed = await dismissedOrders(user.id,records.map(o=>o.id));
  const ids = records.flatMap((o) => o.jobIds);
  const jobs = await db.$queryRaw<
    {
      id: string;
      status: string;
      projectId: string;
      subproductId: string | null;
      productId: string | null;
      projectName: string | null;
      productName: string | null;
      subproductName: string | null;
      snapshot: Record<string, unknown>;
      variationId: string | null;
      reviewStatus: string | null;
      deletedAt: Date | null;
      revision: number | null;
    }[]
  >`SELECT j.id,j.status,j."projectId",j."subproductId",c.id AS "productId",p.name AS "projectName",c.name AS "productName",s.name AS "subproductName",jsonb_build_object('executionMode',j.snapshot->'executionMode','orderFinalCount',j.snapshot->'orderFinalCount','previewFirst',j.snapshot->'previewFirst','index',j.snapshot->'index') AS snapshot,v.id AS "variationId",v."reviewStatus",v."deletedAt",v.revision FROM "GenerationJob" j LEFT JOIN "Variation" v ON v."jobId"=j.id LEFT JOIN "Subproduct" s ON s.id=j."subproductId" LEFT JOIN "Category" c ON c.id=s."categoryId" LEFT JOIN "Project" p ON p.id=j."projectId" WHERE j.id=ANY(${ids}::text[])`;
  return records.map((order) => {
    const rows = jobs.filter((j) => order.jobIds.includes(j.id));
    const context = rows[0];
    const summary = orderSummary(
      order,
      rows.map((j) => ({
        ...j,
        variation: j.variationId
          ? {
              id: j.variationId,
              reviewStatus: j.reviewStatus ?? "PENDING",
              revision: j.revision ?? 1,
              deletedAt: j.deletedAt,
            }
          : null,
      })),
      user,
    );
    const sample = rows.find(
      (j) => j.snapshot.previewFirst === true && j.snapshot.index === 0,
    );
    return {
      ...summary,
      sampleJobId: sample?.id ?? null,
      scope: {
        project:
          context?.projectId === "connection-test"
            ? "none"
            : (context?.projectId ?? ""),
        product: context?.productId ?? "",
        subproduct: context?.subproductId ?? "",
      },
      name:
        context?.subproductName ?? context?.projectName ?? "Prueba de imagen",
      jobs: rows.map((j) => ({
        id: j.id,
        status: j.status,
        variationId: j.variationId,
        reviewStatus: j.reviewStatus,
      })),
    };
  }).filter(order=>!order.hiddenFromProduction&&!dismissed.has(order.id));
}
