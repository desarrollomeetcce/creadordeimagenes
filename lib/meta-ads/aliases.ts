import { activeWorkbookSheetId } from "./workbook-scope";
import { isCountryCode } from "./countries";
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
    select: {
      id: true,
      name: true,
      inventorySheetId: true,
      inventorySheet: { select: { id: true, name: true } },
      tableId: true,
      table: { select: { id: true, name: true } },
    },
    orderBy: { name: "asc" },
    take: 1000,
  });
}
export async function saveAlias(
  actor: Actor,
  name: string,
  id?: string,
  tableId = "diplomados",
  inventorySheetId?: string,
) {
  ownerOnly(actor);
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(884411)`;
    demand(
      await tx.user.findFirst({
        where: { id: actor.id, role: "OWNER", status: "APPROVED" },
      }),
      "Sin permiso para editar inventario.",
      403,
    );
    if (!id)
      inventorySheetId = await activeWorkbookSheetId(
        tx,
        "INVENTORY",
        inventorySheetId,
      );
    if (!id)
      demand(
        await tx.metaAliasTable.findUnique({ where: { id: tableId } }),
        "Tabla no disponible.",
        404,
      );
    if (!id)
      demand(
        (await tx.metaAlias.count()) < 1000,
        "El catálogo admite hasta 1000 elementos de inventario.",
      );
    if (id) {
      const existing = await tx.metaAlias.findUnique({ where: { id } });
      demand(existing, "Inventario no disponible.", 404);
      tableId = existing.tableId;
    }
    demand(
      !(await tx.metaAlias.findFirst({
        where: {
          tableId,
          name: { equals: name, mode: "insensitive" },
          ...(id ? { id: { not: id } } : {}),
        },
      })),
      "Ya existe un elemento del inventario con ese nombre.",
      409,
    );
    const row = id
      ? await tx.metaAlias.update({ where: { id }, data: { name } })
      : await tx.metaAlias.create({
          data: { name, tableId, inventorySheetId },
        });
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
  country?: string | null,
  advisorId?: string | null,
) {
  return assignAliases(actor, [objectId], aliasId, country, advisorId);
}
export async function assignAliases(
  actor: Actor,
  objectIds: string[],
  aliasId: string | null,
  country?: string | null,
  advisorId?: string | null,
) {
  ownerOnly(actor);
  demand(
    country === undefined || country === null || isCountryCode(country),
    "País no válido.",
  );
  demand(
    aliasId !== null || !country,
    "El país debe acompañar a un elemento del inventario.",
  );
  const ids = [...new Set(objectIds)];
  demand(
    ids.length > 0 &&
      ids.length <= 100 &&
      ids.every((id) => /^\d{1,40}$/.test(id)),
    "Selección de inventario inválida.",
  );
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(884411)`;
    demand(
      await tx.user.findFirst({
        where: { id: actor.id, role: "OWNER", status: "APPROVED" },
      }),
      "Sin permiso para asignar inventario.",
      403,
    );
    const count = await tx.metaAdObject.count({
      where: { id: { in: ids }, account: accountWhere(actor) },
    });
    demand(
      count === ids.length,
      "Hay elementos no disponibles en la selección.",
      404,
    );
    if (aliasId)
      demand(
        await tx.metaAlias.findUnique({ where: { id: aliasId } }),
        "Inventario no disponible.",
        404,
      );
    if (advisorId) {
      demand(aliasId && country, "El asesor requiere inventario y país.");
      demand(
        await tx.metaAdvisor.findUnique({ where: { id: advisorId } }),
        "Asesor no disponible.",
        404,
      );
    }
    await tx.metaAdObject.updateMany({
      where: { id: { in: ids } },
      data: {
        aliasId,
        advisorId: aliasId ? (advisorId ?? null) : null,
        ...(!aliasId
          ? { aliasCountry: null }
          : country !== undefined
            ? { aliasCountry: country }
            : {}),
      },
    });
    for (const id of ids)
      await recordActivity(tx, {
        data: {
          actorId: actor.id,
          action: "META_ALIAS_ASIGNADO",
          resourceId: id,
          detail: {
            aliasId,
            advisorId: aliasId ? (advisorId ?? null) : null,
            country: aliasId
              ? country === undefined
                ? "unchanged"
                : country
              : null,
          },
        },
      });
    return { ok: true, count: ids.length };
  });
}

export async function aliasTables(actor: Actor) {
  ownerOnly(actor);
  return db.metaAliasTable.findMany({
    select: {
      id: true,
      name: true,
      aliasColumnName: true,
      defaultCountry: true,
      defaultCurrency: true,
      aliases: {
        select: { id: true, name: true, inventorySheetId: true },
        orderBy: { name: "asc" },
      },
    },
    orderBy: { name: "asc" },
    take: 100,
  });
}
export async function createAliasTable(actor: Actor, name: string) {
  ownerOnly(actor);
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(884411)`;
    demand(
      await tx.user.findFirst({
        where: { id: actor.id, role: "OWNER", status: "APPROVED" },
      }),
      "Sin permiso para crear tablas.",
      403,
    );
    demand(
      (await tx.metaAliasTable.count()) < 100,
      "El catálogo admite hasta 100 tablas.",
    );
    demand(
      !(await tx.metaAliasTable.findFirst({
        where: { name: { equals: name, mode: "insensitive" } },
      })),
      "Ya existe una tabla con ese nombre.",
      409,
    );
    const row = await tx.metaAliasTable.create({ data: { name } });
    await recordActivity(tx, {
      data: {
        actorId: actor.id,
        action: "PRODUCTOS_TABLA_CREADA",
        resourceId: row.id,
      },
    });
    return row;
  });
}

export async function renameAliasTable(actor: Actor, id: string, name: string) {
  ownerOnly(actor);
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(884411)`;
    demand(
      await tx.user.findFirst({
        where: { id: actor.id, role: "OWNER", status: "APPROVED" },
      }),
      "Sin permiso.",
      403,
    );
    demand(
      await tx.metaAliasTable.findUnique({ where: { id } }),
      "Tabla no disponible.",
      404,
    );
    demand(
      !(await tx.metaAliasTable.findFirst({
        where: { name: { equals: name, mode: "insensitive" }, id: { not: id } },
      })),
      "Ya existe una tabla con ese nombre.",
      409,
    );
    const row = await tx.metaAliasTable.update({
      where: { id },
      data: { name },
    });
    await recordActivity(tx, {
      data: {
        actorId: actor.id,
        action: "META_TABLA_RENOMBRADA",
        resourceId: id,
      },
    });
    return row;
  });
}

export async function aliasTableOptions(actor: Actor) {
  return db.metaAliasTable.findMany({
    where:
      actor.role === "OWNER"
        ? {}
        : {
            aliases: {
              some: { objects: { some: { account: accountWhere(actor) } } },
            },
          },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
    take: 100,
  });
}
