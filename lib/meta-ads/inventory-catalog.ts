import { categoryKey } from "./category-paste";
import { limaDay } from "./advisor-attribution";
import type { TrialPayload } from "./inventory-trial-policy";
import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "../db";
import {
  ownerOnly,
  financialAccess,
  financialContext,
  scopePermission,
} from "./financial-access";
import { demand } from "../errors";
import { recordActivity } from "../activity";
import { effectivenessLock } from "./effectiveness";
import type { Actor } from "./service";
import {
  detachedInventoryAliases,
  setInventoryMembership,
} from "./inventory-membership";
/** Grouping is presentation only: each leaf remains an independent source-sheet identity. */
export async function renameInventoryGroup(
  actor: Actor,
  b: { listId: string; name: string; expectedName: string; ids: string[] },
) {
  ownerOnly(actor);
  return db.$transaction(async (tx) => {
    await effectivenessLock(tx, actor);
    demand(
      await tx.metaEffectivenessSheet.findFirst({
        where: { id: b.listId, kind: "INVENTORY", archivedAt: null },
      }),
      "Inventario no disponible.",
      404,
    );
    const ids = [...new Set(b.ids)];
    const rows = await tx.metaAlias.findMany({
      where: { inventorySheetId: b.listId, name: b.expectedName },
    });
    const items = await tx.metaInventoryItem.findMany({
      where: { sheetId: b.listId, name: b.expectedName },
    });
    const sheet = await tx.metaEffectivenessSheet.findUniqueOrThrow({
      where: { id: b.listId },
      select: { config: true },
    });
    const detached = new Set(detachedInventoryAliases(sheet.config));
    const visibleRows = rows.filter((row) => !detached.has(row.id));
    demand(
      visibleRows.length + items.length === ids.length &&
        [...visibleRows, ...items].every((r) => ids.includes(r.id)),
      "El inventario cambió. Recarga antes de renombrar.",
      409,
    );
    demand(
      !(await tx.metaAlias.findFirst({
        where: {
          tableId: { in: rows.map((r) => r.tableId) },
          id: { notIn: ids },
          name: { equals: b.name, mode: "insensitive" },
        },
      })),
      "Ese nombre ya existe en una de las hojas.",
      409,
    );
    demand(
      !(await tx.metaInventoryItem.findFirst({
        where: {
          sheetId: b.listId,
          id: { notIn: ids },
          name: { equals: b.name, mode: "insensitive" },
        },
      })),
      "Ese nombre ya existe en el inventario.",
      409,
    );
    await tx.metaInventoryItem.updateMany({
      where: { id: { in: ids } },
      data: { name: b.name },
    });
    await tx.metaAlias.updateMany({
      where: { id: { in: rows.map((row) => row.id) } },
      data: { name: b.name },
    });
    await recordActivity(tx, {
      data: {
        actorId: actor.id,
        action: "META_INVENTARIO_GRUPO_RENOMBRADO",
        resourceId: b.listId,
        detail: { ids, before: b.expectedName, after: b.name },
      },
    });
    return { ok: true };
  });
}
async function review(tx: Prisma.TransactionClient, id: string) {
  const alias = await tx.metaAlias.findUnique({
    where: { id },
    include: {
      inventorySheet: { select: { revision: true } },
      categoryAssignments: {
        select: {
          categoryId: true,
          category: { select: { name: true, kind: true } },
        },
      },
      table: { select: { id: true, name: true } },
      effectivenessRows: { include: { days: true, salesApprovals: true } },
      effectivenessStates: { include: { events: true } },
      advisorAssignments: true,
      objects: {
        select: {
          id: true,
          aliasId: true,
          aliasCountry: true,
          advisorId: true,
        },
      },
    },
  });
  if (!alias) {
    const item = await tx.metaInventoryItem.findUnique({
      where: { id },
      include: {
        categories: {
          include: { category: { select: { name: true, kind: true } } },
          orderBy: { categoryId: "asc" },
        },
      },
    });
    demand(item, "Inventario no disponible.", 404);
    return {
      id: item.id,
      name: item.name,
      table: { id: "", name: "Ficha de inventario" },
      listId: item.sheetId,
      rows: 0,
      days: 0,
      assignments: 0,
      standalone: true,
      token: createHash("sha256").update(JSON.stringify(item)).digest("hex"),
    };
  }
  // Deterministic ordering protects review from unrelated database query order.
  const canonical = (v: unknown): unknown =>
    Array.isArray(v)
      ? v
          .map(canonical)
          .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
      : v && typeof v === "object" && !(v instanceof Date)
        ? Object.fromEntries(
            Object.entries(v)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, x]) => [k, canonical(x)]),
          )
        : v;
  const token = createHash("sha256")
    .update(JSON.stringify(canonical(alias)))
    .digest("hex");
  return {
    id: alias.id,
    name: alias.name,
    table: alias.table,
    listId: alias.inventorySheetId,
    rows: alias.effectivenessRows.length,
    days: alias.effectivenessRows.reduce((n, r) => n + r.days.length, 0),
    assignments: alias.objects.length,
    token,
    standalone: false,
  };
}
export async function previewRemoveInventory(actor: Actor, id: string) {
  ownerOnly(actor);
  return db.$transaction(async (tx) => {
    await effectivenessLock(tx, actor);
    return review(tx, id);
  });
}
export async function removeInventory(actor: Actor, id: string, token: string) {
  ownerOnly(actor);
  return db.$transaction(async (tx) => {
    await effectivenessLock(tx, actor);
    const r = await review(tx, id);
    demand(
      r.token === token,
      "Los datos cambiaron. Revisa de nuevo antes de eliminar.",
      409,
    );
    await tx.metaAdObject.updateMany({
      where: { aliasId: id },
      data: { aliasId: null, aliasCountry: null, advisorId: null },
    });
    await tx.metaEffectivenessRow.deleteMany({ where: { aliasId: id } });
    if (r.standalone) await tx.metaInventoryItem.delete({ where: { id } });
    else await tx.metaAlias.delete({ where: { id } });
    await recordActivity(tx, {
      data: {
        actorId: actor.id,
        action: "META_INVENTARIO_QUITADO_DE_HOJA",
        resourceId: id,
        detail: r,
      },
    });
    return { ok: true, tableId: r.table.id };
  });
}

async function scopedRemovalIds(
  tx: Prisma.TransactionClient,
  listId: string,
  ids: string[],
) {
  demand(
    ids.length > 0 && ids.length <= 1500 && new Set(ids).size === ids.length,
    "Selección inválida.",
  );
  const found =
    (await tx.metaAlias.count({
      where: { id: { in: ids }, inventorySheetId: listId },
    })) +
    (await tx.metaInventoryItem.count({
      where: { id: { in: ids }, sheetId: listId },
    }));
  demand(
    found === ids.length,
    "La selección cambió o contiene inventario de otra lista. Recarga antes de continuar.",
    409,
  );
}
async function authorizeDiplomaRemoval(
  tx: Prisma.TransactionClient,
  actor: Actor,
  listId: string,
  write: boolean,
) {
  const access = await financialAccess(actor, tx),
    cap = financialContext(actor),
    permission = scopePermission(access, cap?.scope ?? "ALL");
  demand(
    permission && (!write || permission === "EDIT"),
    "No tienes permiso para eliminar estos diplomados.",
    403,
  );
  demand(
    access.isOwner ||
      scopePermission(access, "ALL") ||
      cap?.scope === "TAB:" + listId,
    "La selección no pertenece al documento compartido.",
    403,
  );
  demand(
    await tx.metaEffectivenessSheet.findFirst({
      where: { id: listId, kind: "INVENTORY", archivedAt: null },
      select: { id: true },
    }),
    "Inventario no disponible.",
    404,
  );
}
/** Expand explicit catalog identities, never fuzzy text, to all their leaves in this list. */
async function diplomaRemovalIds(
  tx: Prisma.TransactionClient,
  listId: string,
  catalogIds: string[],
) {
  await scopedRemovalIds(tx, listId, catalogIds);
  const [aliases, items] = await Promise.all([
    tx.metaAlias.findMany({
      where: { inventorySheetId: listId },
      select: { id: true, name: true },
    }),
    tx.metaInventoryItem.findMany({
      where: { sheetId: listId },
      select: { id: true, name: true },
    }),
  ]);
  const records = [...aliases, ...items],
    chosen = new Set(catalogIds);
  const names = new Set(
    records
      .filter((record) => chosen.has(record.id))
      .map((record) => categoryKey(record.name)),
  );
  const ids = records
    .filter((record) => names.has(categoryKey(record.name)))
    .map((record) => record.id)
    .sort();
  demand(
    ids.length <= 1000,
    "La selección tiene demasiados vínculos. Elige menos diplomados.",
  );
  return ids;
}
/** Close membership cycles, keeping previous cycle metadata and all unselected members. */
async function removeDeletedGroupMembers(
  tx: Prisma.TransactionClient,
  listId: string,
  items: { id: string; name: string }[],
) {
  const ids = new Set(items.map((item) => item.id)),
    names = new Set(items.map((item) => categoryKey(item.name))),
    date = limaDay(new Date());
  const groups = await tx.metaInventoryTrialGroup.findMany({
    where: { sheetId: listId, archivedAt: null },
  });
  const affected = [];
  for (const group of groups) {
    const payload = group.payload as unknown as TrialPayload;
    const removed = payload.members.filter(
      (member) => ids.has(member.itemId) || names.has(categoryKey(member.name)),
    );
    if (!removed.length) continue;
    const slots = new Set(removed.map((member) => member.slotId));
    payload.members = payload.members.filter(
      (member) => !slots.has(member.slotId),
    );
    for (const cycle of payload.cycles)
      if (!cycle.until && slots.has(cycle.slotId))
        cycle.until = cycle.since > date ? cycle.since : date;
    await tx.metaInventoryTrialGroup.update({
      where: { id: group.id },
      data: {
        payload: payload as unknown as Prisma.InputJsonValue,
        revision: { increment: 1 },
      },
    });
    affected.push({
      id: group.id,
      name: group.name,
      removed: removed.map((member) => member.itemId),
    });
  }
  return affected;
}
export async function previewRemoveInventorySelection(
  actor: Actor,
  listId: string,
  ids: string[],
  wholeDiplomas = false,
) {
  ownerOnly(actor);
  return db.$transaction(
    async (tx) => {
      await effectivenessLock(tx, actor);
      if (wholeDiplomas)
        await authorizeDiplomaRemoval(tx, actor, listId, false);
      await scopedRemovalIds(tx, listId, ids);
      const targets = wholeDiplomas
        ? await diplomaRemovalIds(tx, listId, ids)
        : ids;
      const items = [];
      for (const id of [...targets].sort()) items.push(await review(tx, id));
      return { listId, items };
    },
    { timeout: 60000 },
  );
}
export async function removeInventorySelection(
  actor: Actor,
  b: {
    listId: string;
    entries: { id: string; token: string }[];
    preserveCatalog?: boolean;
    wholeDiplomas?: boolean;
    catalogIds?: string[];
  },
) {
  ownerOnly(actor);
  return db.$transaction(
    async (tx) => {
      await effectivenessLock(tx, actor);
      if (b.wholeDiplomas)
        await authorizeDiplomaRemoval(tx, actor, b.listId, true);
      const ids = b.entries.map((e) => e.id);
      await scopedRemovalIds(tx, b.listId, ids);
      if (b.wholeDiplomas) {
        demand(
          !b.preserveCatalog && !!b.catalogIds?.length,
          "Selección de diplomados inválida.",
        );
        const current = await diplomaRemovalIds(tx, b.listId, b.catalogIds!);
        demand(
          JSON.stringify(current) === JSON.stringify([...ids].sort()),
          "Los vínculos de un diplomado cambiaron. Revisa de nuevo antes de eliminar.",
          409,
        );
      } else demand(!b.catalogIds, "Selección de diplomados inválida.");
      const items = [];
      for (const entry of b.entries) {
        const r = await review(tx, entry.id);
        demand(
          r.token === entry.token,
          "Uno de los ítems cambió. Revisa de nuevo antes de eliminar la selección.",
          409,
        );
        items.push(r);
      }
      if (b.preserveCatalog) {
        demand(
          items.every((i) => !i.standalone),
          "Solo se pueden quitar vínculos de hojas.",
          409,
        );
        const aliases = await tx.metaAlias.findMany({
          where: { id: { in: ids }, inventorySheetId: b.listId },
          include: { categoryAssignments: true },
        });
        for (const alias of aliases) {
          let item = await tx.metaInventoryItem.findFirst({
            where: { sheetId: b.listId, name: alias.name },
          });
          if (!item)
            item = await tx.metaInventoryItem.create({
              data: { sheetId: b.listId, name: alias.name },
            });
          if (alias.categoryAssignments.length)
            await tx.metaInventoryItemCategory.createMany({
              data: alias.categoryAssignments.map((c) => ({
                itemId: item!.id,
                categoryId: c.categoryId,
              })),
              skipDuplicates: true,
            });
        }
        await tx.metaEffectivenessSheet.update({
          where: { id: b.listId },
          data: { categoryRevision: { increment: 1 } },
        });
        await setInventoryMembership(tx, b.listId, ids, true);
        await recordActivity(tx, {
          data: {
            actorId: actor.id,
            action: "META_INVENTARIO_HOJAS_DESVINCULADAS",
            resourceId: b.listId,
            detail: { items, historyPreserved: true },
          },
        });
        return { ok: true, removed: ids, historyPreserved: true };
      }
      // Validate the complete selection before deleting any leaf or association.
      await tx.metaAdObject.updateMany({
        where: { aliasId: { in: ids } },
        data: { aliasId: null, aliasCountry: null, advisorId: null },
      });
      await tx.metaEffectivenessRow.deleteMany({
        where: { aliasId: { in: ids } },
      });
      await tx.metaAlias.deleteMany({ where: { id: { in: ids } } });
      await tx.metaInventoryItem.deleteMany({ where: { id: { in: ids } } });
      const affectedGroups = b.wholeDiplomas
        ? await removeDeletedGroupMembers(tx, b.listId, items)
        : [];
      if (b.wholeDiplomas) {
        const sheet = await tx.metaEffectivenessSheet.findUniqueOrThrow({
          where: { id: b.listId },
          select: { config: true },
        });
        const config = { ...(sheet.config as Prisma.JsonObject) };
        const names = new Set(items.map((item) => categoryKey(item.name)));
        const usage = config.inventoryGroupUsage;
        if (usage && typeof usage === "object" && !Array.isArray(usage))
          config.inventoryGroupUsage = Object.fromEntries(
            Object.entries(usage).filter(([key]) => {
              try {
                return !names.has(JSON.parse(key)[0]);
              } catch {
                return true;
              }
            }),
          );
        const activation = config.inventoryActivation;
        if (
          activation &&
          typeof activation === "object" &&
          !Array.isArray(activation)
        ) {
          const next = { ...activation };
          if (
            next.rows &&
            typeof next.rows === "object" &&
            !Array.isArray(next.rows)
          )
            next.rows = Object.fromEntries(
              Object.entries(next.rows).filter(
                ([key]) => !ids.includes(key.split("|")[0]),
              ),
            );
          if (Array.isArray(next.detachedAliases))
            next.detachedAliases = next.detachedAliases.filter(
              (id) => typeof id !== "string" || !ids.includes(id),
            );
          config.inventoryActivation = next;
        }
        await tx.metaEffectivenessSheet.update({
          where: { id: b.listId },
          data: { config, categoryRevision: { increment: 1 } },
        });
      }
      await recordActivity(tx, {
        data: {
          actorId: actor.id,
          action: "META_INVENTARIO_SELECCION_ELIMINADA",
          resourceId: b.listId,
          detail: {
            items,
            ...(b.wholeDiplomas ? { wholeDiplomas: true, affectedGroups } : {}),
          },
        },
      });
      return { ok: true, removed: ids };
    },
    { timeout: 60000 },
  );
}
