import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { demand } from "../errors";
import { recordActivity } from "../activity";
import {
  ownerOnly,
  financialContext,
  financialAccess,
  scopePermission,
} from "./financial-access";
import { effectivenessLock } from "./effectiveness";
import type { Actor } from "./service";
const id = z.string().min(1).max(100);
export const inventoryAdvisorsScope = z.object({ listId: id }).strict();
export const inventoryAdvisorChange = inventoryAdvisorsScope
  .extend({
    mode: z.enum(["ADD", "REMOVE"]),
    advisorIds: z.array(id).min(1).max(1000),
    items: z
      .array(
        z
          .object({
            inventoryId: id,
            expectedName: z.string().min(1).max(150),
            revision: z.number().int().nonnegative(),
          })
          .strict(),
      )
      .min(1)
      .max(1500),
  })
  .strict();
async function context(
  tx: Prisma.TransactionClient,
  actor: Actor,
  listId: string,
  write = false,
) {
  ownerOnly(actor);
  await effectivenessLock(tx, actor);
  const access = await financialAccess(actor, tx),
    cap = financialContext(actor),
    scope = cap?.scope ?? "ALL",
    p = scopePermission(access, scope);
  demand(
    p && (!write || p === "EDIT"),
    "No tienes permiso para gestionar los asesores de este inventario.",
    403,
  );
  demand(
    access.isOwner ||
      scopePermission(access, "ALL") ||
      scope === "TAB:" + listId,
    "Selecciona el inventario compartido correspondiente.",
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
export async function inventoryAdvisors(actor: Actor, input: unknown) {
  const b = inventoryAdvisorsScope.parse(input);
  return db.$transaction(
    async (tx) => {
      await context(tx, actor, b.listId);
      const [options, items] = await Promise.all([
        tx.metaAdvisor.findMany({
          where: { sheet: { archivedAt: null, kind: "ADVISORS" } },
          select: { id: true, name: true, sheet: { select: { name: true } } },
          orderBy: { name: "asc" },
          take: 1000,
        }),
        tx.metaInventoryItem.findMany({
          where: {
            sheetId: b.listId,
            OR: [{ advisorRevision: { gt: 0 } }, { advisors: { some: {} } }],
          },
          select: {
            id: true,
            name: true,
            advisorRevision: true,
            advisors: {
              where: {
                advisor: { sheet: { archivedAt: null, kind: "ADVISORS" } },
              },
              select: {
                advisor: {
                  select: {
                    id: true,
                    name: true,
                    sheet: { select: { name: true } },
                  },
                },
              },
            },
          },
        }),
      ]);
      return {
        listId: b.listId,
        options: options.map((p) => ({
          id: p.id,
          name: p.name,
          label: p.name + " · " + p.sheet.name,
        })),
        items: items.map((item) => ({
          id: item.id,
          name: item.name,
          revision: item.advisorRevision,
          advisors: item.advisors.map(({ advisor: p }) => ({
            id: p.id,
            name: p.name,
            label: p.name + " · " + p.sheet.name,
          })),
        })),
      };
    },
    { timeout: 60000 },
  );
}
export async function saveInventoryAdvisors(actor: Actor, input: unknown) {
  const b = inventoryAdvisorChange.parse(input);
  demand(
    new Set(b.advisorIds).size === b.advisorIds.length &&
      new Set(b.items.map((i) => i.inventoryId)).size === b.items.length,
    "No repitas asesores ni inventarios en el mismo lote.",
  );
  return db.$transaction(
    async (tx) => {
      await context(tx, actor, b.listId, true);
      if (b.mode === "ADD")
        demand(
          (await tx.metaAdvisor.count({
            where: {
              id: { in: b.advisorIds },
              sheet: { archivedAt: null, kind: "ADVISORS" },
            },
          })) === b.advisorIds.length,
          "Un asesor ya no está disponible.",
          404,
        );
      const prepared = [];
      for (const item of b.items) {
        const [source, alias] = await Promise.all([
          tx.metaInventoryItem.findFirst({
            where: { id: item.inventoryId, sheetId: b.listId },
          }),
          tx.metaAlias.findFirst({
            where: { id: item.inventoryId, inventorySheetId: b.listId },
          }),
        ]);
        const origin = source ?? alias;
        demand(origin, "Un inventario ya no está disponible.", 404);
        demand(
          origin.name === item.expectedName,
          "Un nombre cambió. Actualiza antes de asignar asesores.",
          409,
        );
        let canonical =
          source ??
          (await tx.metaInventoryItem.findUnique({
            where: {
              sheetId_name: { sheetId: b.listId, name: item.expectedName },
            },
          }));
        demand(
          (canonical?.advisorRevision ?? 0) === item.revision,
          "Los asesores asignados cambiaron. Actualiza antes de guardar.",
          409,
        );
        if (!canonical && b.mode === "REMOVE") continue;
        if (!canonical)
          canonical = await tx.metaInventoryItem.create({
            data: { sheetId: b.listId, name: item.expectedName },
          });
        prepared.push(canonical);
      }
      demand(
        new Set(prepared.map((i) => i.id)).size === prepared.length,
        "Selecciona cada inventario una sola vez.",
      );
      let changed = 0;
      for (const item of prepared) {
        const old = await tx.metaInventoryAdvisor.findMany({
            where: { itemId: item.id },
            select: { advisorId: true },
          }),
          existing = new Set(old.map((r) => r.advisorId));
        let n = 0;
        if (b.mode === "ADD") {
          const ids = b.advisorIds.filter((id) => !existing.has(id));
          if (ids.length) {
            await tx.metaInventoryAdvisor.createMany({
              data: ids.map((advisorId) => ({ itemId: item.id, advisorId })),
            });
            n = ids.length;
          }
        } else
          n = (
            await tx.metaInventoryAdvisor.deleteMany({
              where: { itemId: item.id, advisorId: { in: b.advisorIds } },
            })
          ).count;
        if (n) {
          await tx.metaInventoryItem.update({
            where: { id: item.id },
            data: { advisorRevision: { increment: 1 } },
          });
          changed++;
        }
      }
      if (changed)
        await recordActivity(tx, {
          data: {
            actorId: actor.id,
            action: "INVENTARIO_ASESORES_ACTUALIZADOS",
            resourceId: b.listId,
            detail: {
              mode: b.mode,
              items: changed,
              advisors: b.advisorIds.length,
            },
          },
        });
      return { ok: true, changed, items: b.items.length };
    },
    { timeout: 120000 },
  );
}
export type InventoryAdvisorState = Awaited<
  ReturnType<typeof inventoryAdvisors>
>;
