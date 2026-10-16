import { recordActivity } from "./activity";
import { z } from "zod";
import { db } from "./db";
import { resourceAccess, categoryFullFilter } from "./auth";
import { demand } from "./errors";
type Actor = { id: string; role: string };

export async function deletedSubproducts(
  actor: Actor,
  categoryId: string,
  params: URLSearchParams,
) {
  await resourceAccess(actor, "category", categoryId, "EDIT");
  const page = z.coerce
    .number()
    .int()
    .min(1)
    .max(10000)
    .parse(params.get("page") ?? 1);
  const q = z
    .string()
    .trim()
    .max(200)
    .parse(params.get("q") ?? "");
  const where = {
    categoryId,
    deletedAt: { not: null },
    ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
  };
  const limit = 20;
  const [total, items] = await db.$transaction(
    [
      db.subproduct.count({ where }),
      db.subproduct.findMany({
        where,
        orderBy: [{ deletedAt: "desc" }, { id: "asc" }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          name: true,
          deletedAt: true,
          _count: { select: { variations: true, members: true } },
        },
      }),
    ],
    { isolationLevel: "RepeatableRead" },
  );
  return {
    total,
    items,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
    limit,
  };
}
export async function restoreSubproduct(actor: Actor, id: string) {
  const sub = await db.subproduct.findUnique({
    where: { id },
    select: { id: true, categoryId: true, deletedAt: true },
  });
  demand(sub, "Subproducto no encontrado.", 404);
  await resourceAccess(actor, "category", sub.categoryId, "EDIT");
  demand(sub.deletedAt, "Este subproducto ya está activo.", 409);
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(728291)`;
    const current = await tx.user.findUnique({ where: { id: actor.id } });
    demand(
      current?.status === "APPROVED" && current.role !== "OBSERVER",
      "Tu cuenta no puede restaurar subproductos.",
      403,
    );
    const category = await tx.category.findFirst({
      where: {
        id: sub.categoryId,
        ...categoryFullFilter(current),
        project: { deletedAt: null },
      },
      select: { id: true },
    });
    demand(category, "Ya no tienes permiso para editar este producto.", 404);
    const changed = await tx.subproduct.updateMany({
      where: { id, categoryId: sub.categoryId, deletedAt: sub.deletedAt },
      data: { deletedAt: null },
    });
    demand(
      changed.count,
      "El espacio cambió o ya fue restaurado. Actualiza la lista.",
      409,
    );
    await recordActivity(tx, {
      data: {
        actorId: actor.id,
        action: "SUBPRODUCTO_RESTAURADO",
        resourceId: id,
        detail: { categoryId: sub.categoryId },
      },
    });
    return { ok: true, id, categoryId: sub.categoryId };
  });
}
