import { db } from "./db";
import { demand } from "./errors";
import { orderAccess } from "./generation-orders";
import { recordActivity } from "./activity";
const action = "ORDEN_RETIRADA_DE_BIBLIOTECA";
export async function dismissedOrders(userId: string, ids: string[]) {
  if (!ids.length) return new Set<string>();
  const rows = await db.auditEvent.findMany({
    where: { actorId: userId, action, resourceId: { in: ids } },
    select: { resourceId: true },
  });
  return new Set(
    rows.flatMap((row) => (row.resourceId ? [row.resourceId] : [])),
  );
}
export async function dismissOrders(
  user: { id: string; role: string },
  ids: string[],
) {
  demand(
    user.role !== "OBSERVER",
    "Observador solo puede ver y descargar.",
    403,
  );
  const unique = [...new Set(ids)];
  for (const id of unique) await orderAccess(user, id);
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(728291)`;
    const orders = await tx.generationOrder.findMany({
      where: { id: { in: unique } },
    });
    for (const order of orders) {
      demand(
        ["COMPLETED", "ACCEPTED", "STOPPED", "NEEDS_REVIEW"].includes(
          order.status,
        ),
        "Detén la orden antes de retirar su tarjeta.",
        409,
      );
      const active = await tx.generationJob.count({
        where: {
          id: { in: order.jobIds as string[] },
          status: { in: ["PENDING", "RUNNING"] },
        },
      });
      demand(
        !active,
        "Hay imágenes pendientes o en curso. Detén la orden antes de retirar su tarjeta.",
        409,
      );
    }
    for (const order of orders)
      await recordActivity(tx, {
        data: {
          actorId: user.id,
          action,
          resourceId: order.id,
          detail: { orderId: order.id },
        },
      });
  });
}
