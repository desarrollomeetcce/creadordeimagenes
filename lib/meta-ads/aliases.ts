import {
  ownerOnly as financialOnly,
  isFinancialActor,
  financialContext,
  checkFinancialContext,
  financialUserWhere,
  sharedTableWhere,
  sharedAliasWhere,
} from "./financial-access";
async function metaEditorOnly(
  actor: Actor,
  tx?: import("@prisma/client").Prisma.TransactionClient,
) {
  if (isFinancialActor(actor)) {
    financialOnly(actor);
    if (tx) await checkFinancialContext(actor, tx);
    return;
  }
  return workspaceEditorOnly(actor, tx);
}
const metaEditorUserWhere = (id: string, actor?: Actor) =>
  actor && isFinancialActor(actor)
    ? financialUserWhere(actor)
    : workspaceEditorUserWhere(id);
import {
  metaEditorOnly as workspaceEditorOnly,
  metaEditorUserWhere as workspaceEditorUserWhere,
  metaCanSync,
  workspaceAccess,
} from "./workspace-access";
import { activeWorkbookSheetId } from "./workbook-scope";
import { isCountryCode } from "./countries";
import { db } from "../db";
import { ownerOnly } from "../auth";
import { demand } from "../errors";
import { recordActivity } from "../activity";
import { accountWhere, type Actor } from "./service";
import { isCurrency } from "./currency-codes";
import {
  detachedInventoryAliases,
  setInventoryMembership,
} from "./inventory-membership";
import { categoryKey } from "./category-paste";
import type { Prisma } from "@prisma/client";
export type MetaInventorySelection = {
  tableId: string;
  catalogId?: string;
  name?: string;
  inventorySheetId?: string;
};

export async function metaAssignmentAdvisors(actor: Actor) {
  await workspaceEditorOnly(actor);
  return db.$transaction(async (tx) => {
    await workspaceEditorOnly(actor, tx);
    return tx.metaAdvisor.findMany({
      where: { sheet: { archivedAt: null } },
      select: { id: true, name: true, sheet: { select: { name: true } } },
      orderBy: { name: "asc" },
    });
  });
}
export async function metaAliasCatalog(actor: Actor) {
  await workspaceEditorOnly(actor);
  return db.$transaction(async (tx) => {
    await workspaceEditorOnly(actor, tx);
    const [items, aliases] = await Promise.all([
      tx.metaInventoryItem.findMany({
        where: { sheet: { archivedAt: null, kind: "INVENTORY" } },
        select: {
          id: true,
          name: true,
          sheetId: true,
          sheet: { select: { name: true } },
        },
        orderBy: { name: "asc" },
      }),
      tx.metaAlias.findMany({
        where: { inventorySheet: { archivedAt: null, kind: "INVENTORY" } },
        select: {
          id: true,
          name: true,
          inventorySheetId: true,
          inventorySheet: { select: { name: true } },
        },
        orderBy: { name: "asc" },
      }),
    ]);
    const catalog = new Map<
      string,
      {
        catalogId: string;
        name: string;
        inventorySheetId: string;
        inventorySheetName: string;
      }
    >();
    for (const i of items)
      catalog.set(JSON.stringify([i.sheetId, categoryKey(i.name)]), {
        catalogId: "item:" + i.id,
        name: i.name,
        inventorySheetId: i.sheetId,
        inventorySheetName: i.sheet.name,
      });
    for (const a of aliases) {
      const key = JSON.stringify([a.inventorySheetId, categoryKey(a.name)]);
      if (!catalog.has(key))
        catalog.set(key, {
          catalogId: "alias:" + a.id,
          name: a.name,
          inventorySheetId: a.inventorySheetId,
          inventorySheetName: a.inventorySheet.name,
        });
    }
    return [...catalog.values()].sort((a, b) =>
      a.name.localeCompare(b.name, "es"),
    );
  });
}

async function materializeMetaInventory(
  tx: Prisma.TransactionClient,
  selection: MetaInventorySelection,
) {
  const table = await tx.metaAliasTable.findUnique({
    where: { id: selection.tableId },
  });
  demand(table, "Tabla no disponible.", 404);
  let name = selection.name?.trim() ?? "",
    listId = selection.inventorySheetId,
    categories: string[] = [];
  if (selection.catalogId) {
    if (selection.catalogId.startsWith("item:")) {
      const item = await tx.metaInventoryItem.findUnique({
        where: { id: selection.catalogId.slice(5) },
        include: { categories: true },
      });
      demand(
        item,
        "El diplomado ya no está disponible. Actualiza el catálogo.",
        409,
      );
      name = item.name;
      listId = item.sheetId;
      categories = item.categories.map((c) => c.categoryId);
    } else {
      demand(selection.catalogId.startsWith("alias:"), "Diplomado inválido.");
      const alias = await tx.metaAlias.findUnique({
        where: { id: selection.catalogId.slice(6) },
        include: { categoryAssignments: true },
      });
      demand(
        alias,
        "El diplomado ya no está disponible. Actualiza el catálogo.",
        409,
      );
      name = alias.name;
      listId = alias.inventorySheetId;
      categories = alias.categoryAssignments.map((c) => c.categoryId);
    }
    demand(
      !selection.inventorySheetId || selection.inventorySheetId === listId,
      "El diplomado no pertenece a esa lista.",
      409,
    );
  }
  demand(name.length > 0 && name.length <= 150, "Escribe un nombre válido.");
  listId = await activeWorkbookSheetId(tx, "INVENTORY", listId);
  const existing = (
    await tx.metaAlias.findMany({
      where: { tableId: table.id },
      select: { id: true, name: true, inventorySheetId: true },
    })
  ).filter((a) => categoryKey(a.name) === categoryKey(name));
  demand(
    existing.length <= 1,
    "Hay nombres ambiguos en esta tabla. Revisa el inventario.",
    409,
  );
  if (existing[0]) {
    demand(
      existing[0].inventorySheetId === listId,
      "Ese nombre ya pertenece a otra lista en la tabla.",
      409,
    );
    return existing[0];
  }
  demand(
    (await tx.metaAlias.count()) < 1500,
    "El catálogo admite hasta 1500 elementos de inventario.",
  );
  if (!selection.catalogId) {
    const known = (
      await tx.metaInventoryItem.findMany({
        where: { sheetId: listId },
        select: {
          id: true,
          name: true,
          categories: { select: { categoryId: true } },
        },
      })
    ).find((i) => categoryKey(i.name) === categoryKey(name));
    if (known) {
      name = known.name;
      categories = known.categories.map((c) => c.categoryId);
    } else
      await tx.metaInventoryItem.create({ data: { sheetId: listId, name } });
  }
  const alias = await tx.metaAlias.create({
    data: { tableId: table.id, inventorySheetId: listId, name },
  });
  if (categories.length)
    await tx.metaInventoryCategoryAssignment.createMany({
      data: categories.map((categoryId) => ({ aliasId: alias.id, categoryId })),
      skipDuplicates: true,
    });
  await tx.metaEffectivenessSheet.update({
    where: { id: listId },
    data: { categoryRevision: { increment: 1 } },
  });
  return alias;
}
async function withInventoryMembership<
  T extends { id: string; inventorySheetId: string },
>(rows: T[]) {
  const lists = await db.metaEffectivenessSheet.findMany({
    where: { id: { in: [...new Set(rows.map((a) => a.inventorySheetId))] } },
    select: { id: true, config: true },
  });
  const detached = new Set(
    lists.flatMap((list) => detachedInventoryAliases(list.config)),
  );
  return rows.map((row) => ({
    ...row,
    ...(detached.has(row.id) ? { detached: true } : {}),
  }));
}
export async function aliases(actor: Actor) {
  return withInventoryMembership(
    await db.metaAlias.findMany({
      where: isFinancialActor(actor)
        ? sharedAliasWhere(actor)
        : (await workspaceAccess(actor)).canEdit
          ? {}
          : { objects: { some: { account: await accountWhere(actor) } } },
      select: {
        id: true,
        name: true,
        inventorySheetId: true,
        inventorySheet: { select: { id: true, name: true } },
        tableId: true,
        table: { select: { id: true, name: true } },
      },
      orderBy: { name: "asc" },
      take: 1500,
    }),
  );
}
export async function saveAlias(
  actor: Actor,
  name: string,
  id?: string,
  tableId = "diplomados",
  inventorySheetId?: string,
) {
  await metaEditorOnly(actor);
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(884411)`;
    demand(
      await tx.user.findFirst({
        where: metaEditorUserWhere(actor.id, actor),
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
        (await tx.metaAlias.count()) < 1500,
        "El catálogo admite hasta 1500 elementos de inventario.",
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
  selection?: MetaInventorySelection,
  currency?: string,
) {
  return assignAliases(
    actor,
    [objectId],
    aliasId,
    country,
    advisorId,
    selection,
    currency,
  );
}
export async function assignAliases(
  actor: Actor,
  objectIds: string[],
  aliasId: string | null,
  country?: string | null,
  advisorId?: string | null,
  selection?: MetaInventorySelection,
  currency?: string,
) {
  await metaEditorOnly(actor);
  demand(currency === undefined || isCurrency(currency), "Moneda inválida.");
  if (selection) {
    demand(
      !isFinancialActor(actor),
      "Esta operación requiere acceso de edición a Meta Ads.",
      403,
    );
    demand(
      !aliasId && country && isCountryCode(country),
      "Elige tabla, diplomado y país.",
    );
  }
  demand(
    country === undefined || country === null || isCountryCode(country),
    "País no válido.",
  );
  demand(
    aliasId !== null || !country || !!selection,
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
        where: metaEditorUserWhere(actor.id, actor),
      }),
      "Sin permiso para asignar inventario.",
      403,
    );
    const objects = await tx.metaAdObject.findMany({
      where: { id: { in: ids }, account: await accountWhere(actor) },
      select: {
        id: true,
        status: true,
        effectiveStatus: true,
        account: { select: { currency: true } },
      },
    });
    demand(
      objects.length === ids.length,
      "Hay elementos no disponibles en la selección.",
      404,
    );
    if (selection) aliasId = (await materializeMetaInventory(tx, selection)).id;
    if (aliasId)
      demand(
        await tx.metaAlias.findFirst({
          where: { id: aliasId, inventorySheet: { archivedAt: null } },
        }),
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
    let addedToTable = false;
    if (aliasId && country) {
      const [state, row] = await Promise.all([
        tx.metaEffectivenessState.findUnique({
          where: { aliasId_country: { aliasId, country } },
        }),
        tx.metaEffectivenessRow.findFirst({
          where: { aliasId, country, legacy: false },
        }),
      ]);
      let alias = await tx.metaAlias.findUniqueOrThrow({
        where: { id: aliasId },
        include: { table: true, inventorySheet: true },
      });
      if (
        await setInventoryMembership(
          tx,
          alias.inventorySheetId,
          [alias.id],
          false,
        )
      )
        alias = await tx.metaAlias.findUniqueOrThrow({
          where: { id: alias.id },
          include: { table: true, inventorySheet: true },
        });
      const currencies = [
        ...new Set(objects.map((o) => o.account.currency).filter(Boolean)),
      ];
      const importedCurrency =
        currency ||
        alias.table.defaultCurrency ||
        (currencies.length === 1 ? currencies[0] : "");
      if (currency && row?.displayCurrency)
        demand(
          currency === row.displayCurrency,
          "La fila ya tiene otra moneda. Consérvala o cambia la moneda desde la hoja.",
          409,
        );
      const settings = (
        await import("./inventory-sheet-activation")
      ).activationSettings(alias.inventorySheet.config);
      const key = aliasId + "|" + country,
        control = settings.rows[key];
      const metaActive = objects.some(
        (o) => (o.effectiveStatus || o.status) === "ACTIVE",
      );
      // A real active campaign wins over the CREATE placeholder. Manual active rows stay active.
      const active =
        metaActive ||
        (state?.active === true && control?.campaignTask !== "CREATE");
      if (!state || state.active !== active) {
        const updated = await tx.metaEffectivenessState.upsert({
          where: { aliasId_country: { aliasId, country } },
          create: { aliasId, country, active, revision: 1 },
          update: { active, revision: { increment: 1 } },
        });
        await tx.metaEffectivenessEvent.create({
          data: {
            stateId: updated.id,
            actorId: actor.id,
            active,
            snapshot: {
              priorActive: state?.active ?? false,
              source: "META_INVENTORY_ASSIGNMENT",
            },
          },
        });
      }
      if (!row)
        await tx.metaEffectivenessRow.create({
          data: {
            aliasId,
            country,
            currency: "",
            displayCurrency: importedCurrency,
            advisorId: null,
            hidden: false,
          },
        });
      else if (active && row.hidden)
        await tx.metaEffectivenessRow.updateMany({
          where: { aliasId, country, legacy: false },
          data: { hidden: false },
        });
      if (row && !row.displayCurrency && importedCurrency)
        await tx.metaEffectivenessRow.update({
          where: { id: row.id },
          data: {
            displayCurrency: importedCurrency,
            revision: { increment: 1 },
          },
        });
      if (advisorId)
        await (
          await import("./advisors")
        ).assignMetaInitialAdvisor(tx, actor, aliasId, country, advisorId);
      const next = {
        ...control,
        pinned: control?.pinned ?? false,
        campaignTask:
          control?.campaignTask === "STOP"
            ? ("STOP" as const)
            : ("NONE" as const),
        ...((!row?.advisorId && !advisorId) || !importedCurrency
          ? {
              pendingAssignmentAt:
                control?.pendingAssignmentAt ?? new Date().toISOString(),
            }
          : {}),
      };
      if (JSON.stringify(next) !== JSON.stringify(control)) {
        settings.rows[key] = next;
        await tx.metaEffectivenessSheet.update({
          where: { id: alias.inventorySheetId },
          data: {
            config: {
              ...(alias.inventorySheet.config as Prisma.JsonObject),
              inventoryActivation: settings as unknown as Prisma.InputJsonValue,
            },
            revision: { increment: 1 },
          },
        });
      }
      addedToTable = !row;
    }
    await tx.metaAdObject.updateMany({
      where: { id: { in: ids } },
      data: {
        aliasId,
        ...(aliasId
          ? advisorId === undefined
            ? {}
            : { advisorId }
          : { advisorId: null }),
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
            addedToTable,
            ...(aliasId && advisorId === undefined
              ? {}
              : { advisorId: aliasId ? (advisorId ?? null) : null }),
            country: aliasId
              ? country === undefined
                ? "unchanged"
                : country
              : null,
          },
        },
      });
    return { ok: true, count: ids.length, aliasId, addedToTable };
  });
}

export async function aliasTables(actor: Actor) {
  await metaEditorOnly(actor);
  const tables = await db.metaAliasTable.findMany({
    where: sharedTableWhere(actor),
    select: {
      id: true,
      name: true,
      aliasColumnName: true,
      defaultCountry: true,
      defaultCurrency: true,
      aliases: {
        where: sharedAliasWhere(actor),
        select: { id: true, name: true, inventorySheetId: true },
        orderBy: { name: "asc" },
      },
    },
    orderBy: { name: "asc" },
    take: 100,
  });
  const aliases = new Map(
    (await withInventoryMembership(tables.flatMap((t) => t.aliases))).map(
      (a) => [a.id, a],
    ),
  );
  return tables.map((table) => ({
    ...table,
    aliases: table.aliases.map((a) => aliases.get(a.id)!),
  }));
}
export async function createAliasTable(actor: Actor, name?: string) {
  await metaEditorOnly(actor);
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(884411)`;
    demand(
      await tx.user.findFirst({
        where: metaEditorUserWhere(actor.id, actor),
      }),
      "Sin permiso para crear tablas.",
      403,
    );
    demand(
      (await tx.metaAliasTable.count()) < 100,
      "El catálogo admite hasta 100 tablas.",
    );
    if (!name) {
      const existing = new Set(
        (await tx.metaAliasTable.findMany({ select: { name: true } })).map(
          (t) => t.name.toLocaleLowerCase("es"),
        ),
      );
      let number = 1;
      while (existing.has(`hoja ${number}`)) number++;
      name = `Hoja ${number}`;
    }
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
  await metaEditorOnly(actor);
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(884411)`;
    demand(
      await tx.user.findFirst({
        where: metaEditorUserWhere(actor.id, actor),
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
    where: isFinancialActor(actor)
      ? sharedTableWhere(actor)
      : (await workspaceAccess(actor)).canEdit
        ? {}
        : {
            aliases: {
              some: {
                objects: { some: { account: await accountWhere(actor) } },
              },
            },
          },
    select: {
      id: true,
      name: true,
      defaultCountry: true,
      defaultCurrency: true,
    },
    orderBy: { name: "asc" },
    take: 100,
  });
}
