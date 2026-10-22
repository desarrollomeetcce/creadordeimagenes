import { db } from "../db";
import { ownerOnly } from "../auth";
import { demand } from "../errors";
import { recordActivity } from "../activity";
import { accountWhere, type Actor } from "./service";
export async function aliases(actor: Actor) {
  return db.metaAlias.findMany({
    where:
      actor.role === "OWNER"
        ? {}
        : { objects: { some: { account: accountWhere(actor) } } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
    take: 1000,
  });
}
export async function saveAlias(actor: Actor, name: string, id?: string) {
  ownerOnly(actor);
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(884411)`;
    demand(
      await tx.user.findFirst({
        where: { id: actor.id, role: "OWNER", status: "APPROVED" },
      }),
      "Sin permiso para editar alias.",
      403,
    );
    if (!id)
      demand(
        (await tx.metaAlias.count()) < 1000,
        "El catálogo admite hasta 1000 alias.",
      );
    if (id)
      demand(
        await tx.metaAlias.findUnique({ where: { id } }),
        "Alias no disponible.",
        404,
      );
    demand(
      !(await tx.metaAlias.findFirst({
        where: {
          name: { equals: name, mode: "insensitive" },
          ...(id ? { id: { not: id } } : {}),
        },
      })),
      "Ya existe un alias con ese nombre.",
      409,
    );
    const row = id
      ? await tx.metaAlias.update({ where: { id }, data: { name } })
      : await tx.metaAlias.create({ data: { name } });
    await recordActivity(tx, {
      data: {
        actorId: actor.id,
        action: "META_ALIAS_GUARDADO",
        resourceId: row.id,
      },
    });
    return row;
  });
}
export async function assignAlias(
  actor: Actor,
  objectId: string,
  aliasId: string | null,
) {
  ownerOnly(actor);
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(884411)`;
    demand(
      await tx.user.findFirst({
        where: { id: actor.id, role: "OWNER", status: "APPROVED" },
      }),
      "Sin permiso para asignar alias.",
      403,
    );
    demand(
      await tx.metaAdObject.findUnique({ where: { id: objectId } }),
      "Elemento no disponible.",
      404,
    );
    if (aliasId)
      demand(
        await tx.metaAlias.findUnique({ where: { id: aliasId } }),
        "Alias no disponible.",
        404,
      );
    await tx.metaAdObject.update({
      where: { id: objectId },
      data: { aliasId },
    });
    await recordActivity(tx, {
      data: {
        actorId: actor.id,
        action: "META_ALIAS_ASIGNADO",
        resourceId: objectId,
        detail: { aliasId },
      },
    });
    return { ok: true };
  });
}
