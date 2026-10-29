import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { ownerOnly } from "../auth";
import { AppError, demand } from "../errors";
import { recordActivity } from "../activity";
import { effectivenessLock } from "./effectiveness";
import {
  categoryRows,
  categoryKey,
  categoryIdentity,
  splitCategoryNames,
  type CategoryImportRow,
} from "./category-paste";
import {
  resolveInventoryName,
  type InventoryNameDecision,
} from "./inventory-duplicates";
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
  const items = await tx.metaInventoryItem.findMany({
    where: { sheetId: listId },
    select: {
      id: true,
      name: true,
      categories: { select: { categoryId: true } },
    },
    orderBy: { name: "asc" },
  });
  for (const item of items)
    byAlias[item.id] = item.categories.map((c) => c.categoryId);
  const metadata = await tx.$queryRaw<
    { id: string; syllabi: { id: string; title: string; scope: string }[] }[]
  >`SELECT i.id,COALESCE((SELECT jsonb_agg(jsonb_build_object('id',s->>'id','title',s->>'title','scope',s->>'scope')) FROM jsonb_array_elements(i.syllabi) s),'[]'::jsonb) AS syllabi FROM "MetaInventoryItem" i WHERE i."sheetId"=${listId}`;
  const syllabiById = new Map(metadata.map((m) => [m.id, m.syllabi]));
  return {
    listId,
    revision: sheet.categoryRevision,
    categories,
    relations,
    assignments: byAlias,
    items: items.map(({ id, name }) => ({
      id,
      name,
      syllabi: syllabiById.get(id) ?? [],
    })),
  };
}
export async function inventoryCategories(actor: Actor, listId: string) {
  ownerOnly(actor);
  return db.$transaction((tx) => state(tx, listId), {
    isolationLevel: "RepeatableRead",
  });
}
type Action =
  | {
      action: "IMPORT";
      rows: CategoryImportRow[];
      targetIds?: string[];
      decisions?: InventoryNameDecision[];
    }
  | {
      action: "ASSIGN";
      ids: string[];
      expectedName: string;
      categoryIds: string[];
    }
  | {
      action: "MOVE";
      ids: string[];
      expectedName: string;
      categoryId: string;
      toKind: Kind;
      decisions?: InventoryNameDecision[];
    }
  | {
      action: "ASSIGN_LEVEL";
      ids: string[];
      expectedName: string;
      kind: Kind;
      names: string[];
      decisions?: InventoryNameDecision[];
    }
  | { action: "DELETE"; categoryId: string }
  | { action: "DELETE_MANY"; categoryIds: string[] };
async function fullGroups(
  tx: Prisma.TransactionClient,
  listId: string,
  ids: string[],
) {
  demand(
    ids.length > 0 && ids.length <= 1500 && new Set(ids).size === ids.length,
    "Selección de inventario inválida.",
  );
  const aliases = await tx.metaAlias.findMany({
    where: { id: { in: ids }, inventorySheetId: listId },
    select: { id: true, name: true },
  });
  const items = await tx.metaInventoryItem.findMany({
    where: { id: { in: ids }, sheetId: listId },
    select: { id: true, name: true },
  });
  const found = [...aliases, ...items];
  demand(
    found.length === ids.length,
    "La selección cambió o incluye otra lista.",
    409,
  );
  const allAliases = await tx.metaAlias.findMany({
    where: {
      inventorySheetId: listId,
      name: { in: [...new Set(found.map((a) => a.name))] },
    },
    select: { id: true },
  });
  const allItems = await tx.metaInventoryItem.findMany({
    where: {
      sheetId: listId,
      name: { in: [...new Set(found.map((a) => a.name))] },
    },
    select: { id: true },
  });
  const all = [...allAliases, ...allItems];
  demand(
    all.length === ids.length && all.every((a) => ids.includes(a.id)),
    "La agrupación de inventario cambió. Recarga antes de guardar.",
    409,
  );
  return found;
}
export async function writeInventoryTags(
  tx: Prisma.TransactionClient,
  ids: string[],
  categoryIds: string[],
  replace = false,
) {
  const aliases = await tx.metaAlias.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    }),
    items = await tx.metaInventoryItem.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
  demand(
    aliases.length + items.length === ids.length,
    "El inventario cambió. Recarga.",
    409,
  );
  if (replace) {
    await tx.metaInventoryCategoryAssignment.deleteMany({
      where: { aliasId: { in: ids } },
    });
    await tx.metaInventoryItemCategory.deleteMany({
      where: { itemId: { in: ids } },
    });
  }
  if (aliases.length && categoryIds.length)
    await tx.metaInventoryCategoryAssignment.createMany({
      data: aliases.flatMap((a) =>
        categoryIds.map((categoryId) => ({ aliasId: a.id, categoryId })),
      ),
      skipDuplicates: true,
    });
  if (items.length && categoryIds.length)
    await tx.metaInventoryItemCategory.createMany({
      data: items.flatMap((a) =>
        categoryIds.map((categoryId) => ({ itemId: a.id, categoryId })),
      ),
      skipDuplicates: true,
    });
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
            c.kind + "|" + categoryIdentity(c.name),
            c.id,
          ]),
        );
        const resolve = async (kind: Kind, name: string) => {
          name = resolveInventoryName(
            kind,
            name,
            [...map.entries()]
              .filter(([k]) => k.startsWith(kind + "|"))
              .map(([k]) => k.slice(kind.length + 1)),
            b.decisions,
          );
          const key = kind + "|" + categoryIdentity(name);
          if (map.has(key)) return map.get(key)!;
          demand(
            map.size < 1000,
            "Se admiten hasta 1000 categorías por lista.",
          );
          const row = await tx.metaInventoryCategory.create({
            data: {
              sheetId: b.listId,
              kind,
              name,
              key: categoryIdentity(name),
            },
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
          for (const name of splitCategoryNames(row.secondary, 100)) {
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
                next.filter((c) => kind.get(c) === level).length <=
                  (level === "SECONDARY" ? 100 : 20),
                "Un ítem admite hasta 20 categorías principales y 100 secundarias.",
              );
            for (const categoryId of added)
              data.push({ aliasId: id, categoryId });
          }
          if (data.length)
            await writeInventoryTags(tx, b.targetIds, [...added]);
          affected = b.targetIds.length;
        }
      } else if (b.action === "ASSIGN_LEVEL") {
        const found = await fullGroups(tx, b.listId, b.ids);
        demand(
          found.every((a) => a.name === b.expectedName),
          "El inventario cambió. Recarga.",
          409,
        );
        demand(
          new Set(b.names).size === b.names.length &&
            b.names.every((name) =>
              before.categories.some((c) => c.name === name),
            ),
          "Categoría no disponible en esta lista.",
          404,
        );
        const definitions = [...before.categories],
          selected: string[] = [];
        for (const value of b.names) {
          const name = resolveInventoryName(
            b.kind,
            value,
            definitions.filter((c) => c.kind === b.kind).map((c) => c.name),
            b.decisions,
          );
          let target = definitions.find(
            (c) => c.kind === b.kind && c.name === name,
          );
          if (!target) {
            demand(
              definitions.length < 1000,
              "Se admiten hasta 1000 categorías por lista.",
            );
            target = await tx.metaInventoryCategory.create({
              data: {
                sheetId: b.listId,
                kind: b.kind,
                name,
                key: categoryIdentity(name),
              },
            });
            definitions.push(target);
          }
          selected.push(target.id);
        }
        const kinds = new Map(definitions.map((c) => [c.id, c.kind]));
        const updates = b.ids.map((id) => ({
          id,
          tags: [
            ...new Set([
              ...(before.assignments[id] ?? []).filter(
                (c) => kinds.get(c) !== b.kind,
              ),
              ...selected,
            ]),
          ],
        }));
        for (const row of updates)
          for (const kind of ["PRIMARY", "SECONDARY"])
            demand(
              row.tags.filter((id) => kinds.get(id) === kind).length <=
                (kind === "SECONDARY" ? 100 : 20),
              "Un ítem admite hasta 20 categorías principales y 100 secundarias.",
            );
        for (const row of updates)
          await writeInventoryTags(tx, [row.id], row.tags, true);
        affected = b.ids.length;
      } else if (b.action === "MOVE") {
        const found = await fullGroups(tx, b.listId, b.ids);
        demand(
          found.every((a) => a.name === b.expectedName),
          "El inventario cambió. Recarga.",
          409,
        );
        const source = before.categories.find((c) => c.id === b.categoryId);
        demand(source, "Categoría no disponible en esta lista.", 404);
        demand(
          source.kind !== b.toKind,
          "La categoría ya está en esa columna.",
        );
        demand(
          b.ids.some((id) =>
            (before.assignments[id] ?? []).includes(source.id),
          ),
          "La categoría ya no está asignada a este ítem. Recarga.",
          409,
        );
        const name = resolveInventoryName(
          b.toKind,
          source.name,
          before.categories
            .filter((c) => c.kind === b.toKind)
            .map((c) => c.name),
          b.decisions,
        );
        let target = before.categories.find(
          (c) => c.kind === b.toKind && c.name === name,
        );
        if (!target) {
          demand(
            before.categories.length < 1000,
            "Se admiten hasta 1000 categorías por lista.",
          );
          target = await tx.metaInventoryCategory.create({
            data: {
              sheetId: b.listId,
              kind: b.toKind,
              name,
              key: categoryIdentity(name),
            },
          });
        }
        const kinds = new Map([
          ...before.categories.map((c) => [c.id, c.kind] as const),
          [target.id, target.kind] as const,
        ]);
        const updates = b.ids.map((id) => ({
          id,
          tags: [
            ...new Set([
              ...(before.assignments[id] ?? []).filter((c) => c !== source.id),
              target.id,
            ]),
          ],
        }));
        for (const row of updates)
          for (const kind of ["PRIMARY", "SECONDARY"])
            demand(
              row.tags.filter((id) => kinds.get(id) === kind).length <=
                (kind === "SECONDARY" ? 100 : 20),
              "Un ítem admite hasta 20 categorías principales y 100 secundarias.",
            );
        for (const row of updates)
          await writeInventoryTags(tx, [row.id], row.tags, true);
        affected = b.ids.length;
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
            chosen.filter((c) => c.kind === kind).length <=
              (kind === "SECONDARY" ? 100 : 20),
            "Un ítem admite hasta 20 categorías principales y 100 secundarias.",
          );
        await writeInventoryTags(
          tx,
          b.ids,
          chosen.map((c) => c.id),
          true,
        );
        affected = b.ids.length;
      } else {
        const requestedIds =
          b.action === "DELETE" ? [b.categoryId] : b.categoryIds;
        const ids = requestedIds;
        demand(
          ids.length > 0 &&
            new Set(ids).size === ids.length &&
            ids.every((id) => before.categories.some((c) => c.id === id)),
          "Categoría no disponible.",
          404,
        );
        // A category name is one concept; deletion removes both usage levels.
        const names = new Set(
          before.categories
            .filter((c) => requestedIds.includes(c.id))
            .map((c) => categoryKey(c.name)),
        );
        const allIds = before.categories
          .filter((c) => names.has(categoryKey(c.name)))
          .map((c) => c.id);
        affected = await tx.metaInventoryCategoryAssignment.count({
          where: { categoryId: { in: allIds } },
        });
        affected += await tx.metaInventoryItemCategory.count({
          where: { categoryId: { in: allIds } },
        });
        await tx.metaInventoryCategory.deleteMany({
          where: { id: { in: allIds } },
        });
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
            ...(b.action === "ASSIGN_LEVEL"
              ? { kind: b.kind, names: b.names, ids: b.ids }
              : {}),
            ...(b.action === "MOVE"
              ? { categoryId: b.categoryId, toKind: b.toKind, ids: b.ids }
              : {}),
          },
        },
      });
      return state(tx, b.listId);
    },
    { timeout: 60000 },
  );
}
