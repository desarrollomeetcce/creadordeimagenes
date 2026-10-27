import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { ownerOnly } from "../auth";
import { AppError, demand } from "../errors";
import { recordActivity } from "../activity";
import { effectivenessLock } from "./effectiveness";
import {
  categoryRows,
  categoryKey,
  splitCategoryNames,
  type CategoryImportRow,
} from "./category-paste";
import type { Actor } from "./service";
type Kind = "PRIMARY" | "SECONDARY";
async function state(tx: Prisma.TransactionClient, listId: string) {
  const sheet = await tx.metaEffectivenessSheet.findFirst({
    where: { id: listId, kind: "INVENTORY", archivedAt: null },
  });
  demand(sheet, "Lista de inventario no disponible.", 404);
  const categories = await tx.metaInventoryCategory.findMany({
    where: { sheetId: listId },
    select: { id: true, name: true, kind: true },
    orderBy: [{ kind: "asc" }, { name: "asc" }],
  });
  const relations = await tx.metaInventoryCategoryRelation.findMany({
    where: { primary: { sheetId: listId } },
    select: { primaryId: true, secondaryId: true },
  });
  const assignments = await tx.metaInventoryCategoryAssignment.findMany({
    where: {
      category: { sheetId: listId },
      alias: { inventorySheetId: listId },
    },
    select: { aliasId: true, categoryId: true },
  });
  const byAlias: Record<string, string[]> = {};
  for (const a of assignments) (byAlias[a.aliasId] ??= []).push(a.categoryId);
  return {
    listId,
    revision: sheet.categoryRevision,
    categories,
    relations,
    assignments: byAlias,
  };
}
export async function inventoryCategories(actor: Actor, listId: string) {
  ownerOnly(actor);
  return db.$transaction((tx) => state(tx, listId), {
    isolationLevel: "RepeatableRead",
  });
}
type Action =
  | { action: "IMPORT"; rows: CategoryImportRow[]; targetIds?: string[] }
  | {
      action: "ASSIGN";
      ids: string[];
      expectedName: string;
      categoryIds: string[];
    }
  | { action: "DELETE"; categoryId: string };
async function fullGroups(
  tx: Prisma.TransactionClient,
  listId: string,
  ids: string[],
) {
  demand(
    ids.length > 0 && ids.length <= 1000 && new Set(ids).size === ids.length,
    "Selección de inventario inválida.",
  );
  const found = await tx.metaAlias.findMany({
    where: { id: { in: ids }, inventorySheetId: listId },
    select: { id: true, name: true },
  });
  demand(
    found.length === ids.length,
    "La selección cambió o incluye otra lista.",
    409,
  );
  const all = await tx.metaAlias.findMany({
    where: {
      inventorySheetId: listId,
      name: { in: [...new Set(found.map((a) => a.name))] },
    },
    select: { id: true },
  });
  demand(
    all.length === ids.length && all.every((a) => ids.includes(a.id)),
    "La agrupación de inventario cambió. Recarga antes de guardar.",
    409,
  );
  return found;
}
export async function saveInventoryCategories(
  actor: Actor,
  b: { listId: string; revision: number } & Action,
) {
  ownerOnly(actor);
  return db.$transaction(
    async (tx) => {
      await effectivenessLock(tx, actor);
      const before = await state(tx, b.listId);
      demand(
        before.revision === b.revision,
        "Las categorías cambiaron. Recarga las categorías antes de guardar.",
        409,
      );
      let affected = 0;
      if (b.action === "IMPORT") {
        let rows: CategoryImportRow[];
        try {
          rows = categoryRows(b.rows.map((r) => [r.primary, r.secondary]));
        } catch (e) {
          throw new AppError((e as Error).message);
        }
        if (b.targetIds?.length) await fullGroups(tx, b.listId, b.targetIds);
        const map = new Map(
          before.categories.map((c) => [
            c.kind + "|" + categoryKey(c.name),
            c.id,
          ]),
        );
        const resolve = async (kind: Kind, name: string) => {
          const key = kind + "|" + categoryKey(name);
          if (map.has(key)) return map.get(key)!;
          demand(
            map.size < 1000,
            "Se admiten hasta 1000 categorías por lista.",
          );
          const row = await tx.metaInventoryCategory.create({
            data: { sheetId: b.listId, kind, name, key: categoryKey(name) },
          });
          map.set(key, row.id);
          return row.id;
        };
        const added = new Set<string>(),
          links: { primaryId: string; secondaryId: string }[] = [];
        for (const row of rows) {
          const primary: string[] = [],
            secondary: string[] = [];
          for (const name of splitCategoryNames(row.primary)) {
            const id = await resolve("PRIMARY", name);
            primary.push(id);
            added.add(id);
          }
          for (const name of splitCategoryNames(row.secondary)) {
            const id = await resolve("SECONDARY", name);
            secondary.push(id);
            added.add(id);
          }
          for (const p of primary)
            for (const s of secondary)
              links.push({ primaryId: p, secondaryId: s });
        }
        if (links.length)
          await tx.metaInventoryCategoryRelation.createMany({
            data: [
              ...new Map(
                links.map((r) => [r.primaryId + "|" + r.secondaryId, r]),
              ).values(),
            ],
            skipDuplicates: true,
          });
        if (b.targetIds?.length) {
          const all = await tx.metaInventoryCategory.findMany({
              where: { sheetId: b.listId },
              select: { id: true, kind: true },
            }),
            kind = new Map(all.map((c) => [c.id, c.kind]));
          const data: { aliasId: string; categoryId: string }[] = [];
          for (const id of b.targetIds) {
            const next = [
              ...new Set([...(before.assignments[id] ?? []), ...added]),
            ];
            for (const level of ["PRIMARY", "SECONDARY"])
              demand(
                next.filter((c) => kind.get(c) === level).length <= 20,
                "Un ítem admite hasta 20 categorías de cada nivel.",
              );
            for (const categoryId of added)
              data.push({ aliasId: id, categoryId });
          }
          if (data.length)
            await tx.metaInventoryCategoryAssignment.createMany({
              data,
              skipDuplicates: true,
            });
          affected = b.targetIds.length;
        }
      } else if (b.action === "ASSIGN") {
        const found = await fullGroups(tx, b.listId, b.ids);
        demand(
          found.every((a) => a.name === b.expectedName),
          "El nombre del inventario cambió. Recarga.",
          409,
        );
        demand(
          new Set(b.categoryIds).size === b.categoryIds.length,
          "Hay categorías repetidas.",
        );
        const chosen = before.categories.filter((c) =>
          b.categoryIds.includes(c.id),
        );
        demand(
          chosen.length === b.categoryIds.length,
          "Categoría no disponible en esta lista.",
          404,
        );
        for (const kind of ["PRIMARY", "SECONDARY"])
          demand(
            chosen.filter((c) => c.kind === kind).length <= 20,
            "Un ítem admite hasta 20 categorías de cada nivel.",
          );
        await tx.metaInventoryCategoryAssignment.deleteMany({
          where: { aliasId: { in: b.ids } },
        });
        if (chosen.length)
          await tx.metaInventoryCategoryAssignment.createMany({
            data: b.ids.flatMap((aliasId) =>
              chosen.map((c) => ({ aliasId, categoryId: c.id })),
            ),
          });
        affected = b.ids.length;
      } else {
        demand(
          before.categories.some((c) => c.id === b.categoryId),
          "Categoría no disponible.",
          404,
        );
        affected = await tx.metaInventoryCategoryAssignment.count({
          where: { categoryId: b.categoryId },
        });
        await tx.metaInventoryCategory.delete({ where: { id: b.categoryId } });
      }
      await tx.metaEffectivenessSheet.update({
        where: { id: b.listId },
        data: { categoryRevision: { increment: 1 } },
      });
      await recordActivity(tx, {
        data: {
          actorId: actor.id,
          action: "META_INVENTARIO_CATEGORIAS_" + b.action,
          resourceId: b.listId,
          detail: {
            action: b.action,
            affected,
            ...(b.action === "DELETE" ? { categoryId: b.categoryId } : {}),
          },
        },
      });
      return state(tx, b.listId);
    },
    { timeout: 60000 },
  );
}
