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
    const ids = [...new Set(b.ids)];
    const rows = await tx.metaAlias.findMany({
      where: { inventorySheetId: b.listId, name: b.expectedName },
    });
    demand(
      rows.length === ids.length && rows.every((r) => ids.includes(r.id)),
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
  demand(alias, "Inventario no disponible en esa hoja.", 404);
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
    await tx.metaAlias.delete({ where: { id } });
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
