import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { ownerOnly } from "../auth";
import { demand } from "../errors";
import { recordActivity } from "../activity";
import { effectivenessLock } from "./effectiveness";
import type { Actor } from "./service";
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
    demand(
      rows.length + items.length === ids.length &&
        [...rows, ...items].every((r) => ids.includes(r.id)),
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
      where: { id: { in: ids } },
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
    ids.length > 0 && ids.length <= 1000 && new Set(ids).size === ids.length,
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
export async function previewRemoveInventorySelection(
  actor: Actor,
  listId: string,
  ids: string[],
) {
  ownerOnly(actor);
  return db.$transaction(
    async (tx) => {
      await effectivenessLock(tx, actor);
      await scopedRemovalIds(tx, listId, ids);
      const items = [];
      for (const id of [...ids].sort()) items.push(await review(tx, id));
      return { listId, items };
    },
    { timeout: 60000 },
  );
}
export async function removeInventorySelection(
  actor: Actor,
  b: { listId: string; entries: { id: string; token: string }[] },
) {
  ownerOnly(actor);
  return db.$transaction(
    async (tx) => {
      await effectivenessLock(tx, actor);
      const ids = b.entries.map((e) => e.id);
      await scopedRemovalIds(tx, b.listId, ids);
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
      await recordActivity(tx, {
        data: {
          actorId: actor.id,
          action: "META_INVENTARIO_SELECCION_ELIMINADA",
          resourceId: b.listId,
          detail: { items },
        },
      });
      return { ok: true, removed: ids };
    },
    { timeout: 60000 },
  );
}
