import { db } from "./db";
import { resourceAccess, subproductFilter } from "./auth";
import { demand } from "./errors";
export async function removeSubproducts(
  actor: { id: string; role: string },
  ids: string[],
) {
  const unique = [...new Set(ids)];
  for (const id of unique)
    await resourceAccess(actor, "subproduct", id, "EDIT");
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(728291)`;
    const current = await tx.user.findUnique({ where: { id: actor.id } });
    demand(
      current?.status === "APPROVED" && current.role !== "OBSERVER",
      "Tu cuenta no puede eliminar subproductos.",
      403,
    );
    const authorized = await tx.subproduct.count({
      where: { id: { in: unique }, ...subproductFilter(current) },
    });
    demand(
      authorized === unique.length,
      "La selección cambió o contiene subproductos sin acceso.",
      404,
    );
    const running = await tx.generationJob.count({
      where: { subproductId: { in: unique }, status: "RUNNING" },
    });
    demand(
      !running,
      "Hay una generación en curso en estos subproductos. Espera a que termine antes de eliminarlos.",
      409,
    );
    const pending = await tx.generationJob.findMany({
      where: { subproductId: { in: unique }, status: "PENDING" },
      select: { id: true },
    });
    await tx.generationJob.updateMany({
      where: { id: { in: pending.map((p) => p.id) }, status: "PENDING" },
      data: { status: "CANCELLED", completedAt: new Date() },
    });
    await tx.usageLedger.updateMany({
      where: { jobId: { in: pending.map((p) => p.id) } },
      data: { status: "RELEASED" },
    });
    const result = await tx.subproduct.updateMany({
      where: { id: { in: unique }, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    await tx.auditEvent.create({
      data: {
        actorId: actor.id,
        action: "SUBPRODUCTOS_ELIMINADOS",
        detail: { ids: unique, cancelled: pending.length },
      },
    });
    return { removed: result.count, cancelled: pending.length };
  });
}
