import { detachedInventoryAliases } from "./inventory-membership";
import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { ownerOnly } from "./financial-access";
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
import {
  categoryAssignmentTags,
  removeCategoryTagPairs,
} from "./inventory-category-policy";
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
  | {
      action: "ASSIGN_BULK";
      ids: string[];
      kind: "PRIMARY" | "SECONDARY";
      names: string[];
    }
  | {
      action: "REMOVE_BULK";
      ids: string[];
      kind: "PRIMARY" | "SECONDARY";
      names: string[];
    }
  | { action: "CLEAR_BULK"; ids: string[]; kind: "PRIMARY" | "SECONDARY" }
  | { action: "RENAME"; categoryId: string; name: string }
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
    select: { id: true, name: true },
  });
  const allItems = await tx.metaInventoryItem.findMany({
    where: {
      sheetId: listId,
      name: { in: [...new Set(found.map((a) => a.name))] },
    },
    select: { id: true, name: true },
  });
  const list = await tx.metaEffectivenessSheet.findUniqueOrThrow({
    where: { id: listId },
    select: { config: true },
  });
  const detached = new Set(detachedInventoryAliases(list.config));
  const all = [...allAliases.filter((a) => !detached.has(a.id)), ...allItems];
  demand(
    all.every((a) => ids.includes(a.id)),
    "La agrupación de inventario cambió. Recarga antes de guardar.",
    409,
  );
  return [...allAliases, ...allItems];
}
export async function writeInventoryTags(
  tx: Prisma.TransactionClient,
  ids: string[],
  categoryIds: string[],
  replace = false,
) {
  const aliases = await tx.metaAlias.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        inventorySheetId: true,
        categoryAssignments: { select: { categoryId: true } },
      },
    }),
    items = await tx.metaInventoryItem.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        sheetId: true,
        categories: { select: { categoryId: true } },
      },
    });
  demand(
    aliases.length + items.length === ids.length,
    "El inventario cambió. Recarga.",
    409,
  );
  const listIds = new Set([
    ...aliases.map((a) => a.inventorySheetId),
    ...items.map((i) => i.sheetId),
  ]);
  demand(listIds.size === 1, "La selección incluye otra lista.", 409);
  const definitions = await tx.metaInventoryCategory.findMany({
    where: { sheetId: [...listIds][0] },
  });
  const kinds = new Map(definitions.map((c) => [c.id, c.kind]));
  const aliasWrites: { aliasId: string; categoryId: string }[] = [],
    itemWrites: { itemId: string; categoryId: string }[] = [],
    aliasRemovals: typeof aliasWrites = [],
    itemRemovals: typeof itemWrites = [];
  for (const entity of [
    ...aliases.map((a) => ({
      id: a.id,
      item: false,
      tags: a.categoryAssignments.map((c) => c.categoryId),
    })),
    ...items.map((i) => ({
      id: i.id,
      item: true,
      tags: i.categories.map((c) => c.categoryId),
    })),
  ]) {
    const next = categoryAssignmentTags(
      definitions,
      replace ? [] : entity.tags,
      categoryIds,
    );
    for (const kind of ["PRIMARY", "SECONDARY"])
      demand(
        next.filter((id) => kinds.get(id) === kind).length <=
          (kind === "PRIMARY" ? 20 : 100),
        "Un ítem admite hasta 20 categorías principales y 100 secundarias.",
      );
    for (const id of entity.tags.filter((id) => !next.includes(id))) {
      if (entity.item) itemRemovals.push({ itemId: entity.id, categoryId: id });
      else aliasRemovals.push({ aliasId: entity.id, categoryId: id });
    }
    for (const id of next) {
      if (entity.item) itemWrites.push({ itemId: entity.id, categoryId: id });
      else aliasWrites.push({ aliasId: entity.id, categoryId: id });
    }
  }
  await removeCategoryTagPairs(tx, itemRemovals, aliasRemovals);
  if (aliasWrites.length)
    await tx.metaInventoryCategoryAssignment.createMany({
      data: aliasWrites,
      skipDuplicates: true,
    });
  if (itemWrites.length)
    await tx.metaInventoryItemCategory.createMany({
      data: itemWrites,
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
          await writeInventoryTags(tx, b.targetIds, [...added]);
          affected = b.targetIds.length;
        }
      } else if (b.action === "CLEAR_BULK" || b.action === "REMOVE_BULK") {
        await fullGroups(tx, b.listId, b.ids);
        const categoryIds = before.categories
          .filter(
            (c) =>
              c.kind === b.kind &&
              (b.action !== "REMOVE_BULK" ||
                b.names.some((n) => categoryKey(n) === categoryKey(c.name))),
          )
          .map((c) => c.id);
        await tx.metaInventoryCategoryAssignment.deleteMany({
          where: { aliasId: { in: b.ids }, categoryId: { in: categoryIds } },
        });
        await tx.metaInventoryItemCategory.deleteMany({
          where: { itemId: { in: b.ids }, categoryId: { in: categoryIds } },
        });
        affected = b.ids.length;
      } else if (b.action === "ASSIGN_BULK") {
        const found = await fullGroups(tx, b.listId, b.ids);
        const keys = new Set(b.names.map(categoryKey));
        demand(
          keys.size > 0 &&
            keys.size === b.names.length &&
            keys.size <= (b.kind === "PRIMARY" ? 20 : 100),
          "Selecciona categorías diferentes dentro del límite del nivel elegido.",
        );
        const definitions = [...before.categories];
        demand(
          [...keys].every((key) =>
            definitions.some((c) => categoryKey(c.name) === key),
          ),
          "Categoría no disponible en esta lista.",
          404,
        );
        const selectedIds: string[] = [];
        for (const key of keys) {
          const existing = definitions.find(
            (c) => categoryKey(c.name) === key && c.kind === b.kind,
          );
          if (existing) selectedIds.push(existing.id);
          else {
            demand(
              definitions.length < 1000,
              "Se admiten hasta 1000 categorías por lista.",
            );
            const name = definitions.find(
              (c) => categoryKey(c.name) === key,
            )!.name;
            const row = await tx.metaInventoryCategory.create({
              data: {
                sheetId: b.listId,
                kind: b.kind,
                name,
                key: categoryIdentity(name),
              },
            });
            definitions.push(row);
            selectedIds.push(row.id);
          }
        }
        const replaced = before.categories
          .filter((c) => keys.has(categoryKey(c.name)))
          .map((c) => c.id);
        const kinds = new Map(definitions.map((c) => [c.id, c.kind]));
        for (const id of b.ids) {
          const next = [
            ...(before.assignments[id] ?? []).filter(
              (c) => !replaced.includes(c),
            ),
            ...selectedIds,
          ];
          for (const kind of ["PRIMARY", "SECONDARY"])
            demand(
              next.filter((id) => kinds.get(id) === kind).length <=
                (kind === "PRIMARY" ? 20 : 100),
              "Un ítem admite hasta 20 categorías principales y 100 secundarias.",
            );
        }
        const aliasIds = (
          await tx.metaAlias.findMany({
            where: { id: { in: b.ids }, inventorySheetId: b.listId },
            select: { id: true },
          })
        ).map((a) => a.id);
        const itemIds = (
          await tx.metaInventoryItem.findMany({
            where: { id: { in: b.ids }, sheetId: b.listId },
            select: { id: true },
          })
        ).map((a) => a.id);
        await tx.metaInventoryCategoryAssignment.deleteMany({
          where: { aliasId: { in: aliasIds }, categoryId: { in: replaced } },
        });
        await tx.metaInventoryItemCategory.deleteMany({
          where: { itemId: { in: itemIds }, categoryId: { in: replaced } },
        });
        if (aliasIds.length)
          await tx.metaInventoryCategoryAssignment.createMany({
            data: aliasIds.flatMap((aliasId) =>
              selectedIds.map((categoryId) => ({ aliasId, categoryId })),
            ),
            skipDuplicates: true,
          });
        if (itemIds.length)
          await tx.metaInventoryItemCategory.createMany({
            data: itemIds.flatMap((itemId) =>
              selectedIds.map((categoryId) => ({ itemId, categoryId })),
            ),
            skipDuplicates: true,
          });
        affected = new Set(found.map((a) => a.name)).size;
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
          tags: categoryAssignmentTags(
            definitions,
            (before.assignments[id] ?? []).filter(
              (c) => kinds.get(c) !== b.kind,
            ),
            selected,
          ),
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
          tags: categoryAssignmentTags(
            [...before.categories, target],
            (before.assignments[id] ?? []).filter((c) => c !== source.id),
            [target.id],
          ),
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
      } else if (b.action === "RENAME") {
        const source = before.categories.find((c) => c.id === b.categoryId);
        demand(source, "Categoría no disponible en esta lista.", 404);
        const nextName = b.name.trim().replace(/\s+/g, " ");
        demand(
          nextName.length > 0 &&
            nextName.length <= 80 &&
            !/[,;\n]/.test(b.name),
          "Indica un solo nombre de categoría de hasta 80 caracteres.",
        );
        const sourceRows = before.categories.filter(
          (c) => categoryKey(c.name) === categoryKey(source.name),
        );
        const destinationRows = before.categories.filter(
          (c) => categoryKey(c.name) === categoryKey(nextName),
        );
        const merging =
          destinationRows.length > 0 &&
          categoryKey(source.name) !== categoryKey(nextName);
        const finalName = merging ? destinationRows[0].name : nextName;
        const sourceIds = new Set(sourceRows.map((c) => c.id));
        const destinationIds = new Set(destinationRows.map((c) => c.id));
        const targetByKind = new Map<string, string>();
        for (const kind of new Set(
          [...sourceRows, ...destinationRows].map((c) => c.kind),
        )) {
          const existing =
            destinationRows.find(
              (c) => c.kind === kind && c.name === finalName,
            ) ?? destinationRows.find((c) => c.kind === kind);
          if (existing) {
            targetByKind.set(kind, existing.id);
          } else {
            const row = await tx.metaInventoryCategory.create({
              data: {
                sheetId: b.listId,
                kind,
                name: finalName,
                key: categoryIdentity(finalName),
              },
            });
            targetByKind.set(kind, row.id);
          }
        }
        const aliases = await tx.metaAlias.findMany({
          where: { inventorySheetId: b.listId },
          select: { id: true, name: true },
        });
        const entities = [
          ...aliases.map((a) => ({ ...a, item: false })),
          ...before.items.map((i) => ({ id: i.id, name: i.name, item: true })),
        ];
        const groups = new Map<string, typeof entities>();
        for (const entity of entities) {
          if (!groups.has(entity.name)) groups.set(entity.name, []);
          groups.get(entity.name)!.push(entity);
        }
        const aliasWrites: { aliasId: string; categoryId: string }[] = [],
          itemWrites: { itemId: string; categoryId: string }[] = [];
        const aliasIds: string[] = [],
          itemIds: string[] = [];
        const categoryById = new Map(before.categories.map((c) => [c.id, c]));
        for (const members of groups.values()) {
          const tags = [
            ...new Set(members.flatMap((e) => before.assignments[e.id] ?? [])),
          ];
          if (!tags.some((id) => sourceIds.has(id))) continue;
          // Preserve an already assigned destination; otherwise inherit the source usage.
          const existing = tags.filter(
            (id) => destinationIds.has(id) && (!sourceIds.has(id) || !merging),
          );
          const candidates = existing.length
            ? existing
            : tags.filter((id) => sourceIds.has(id));
          const kind = candidates.some(
            (id) => categoryById.get(id)?.kind === "PRIMARY",
          )
            ? "PRIMARY"
            : "SECONDARY";
          const targetId = targetByKind.get(kind)!;
          for (const member of members) {
            const remainingInKind = (
              before.assignments[member.id] ?? []
            ).filter(
              (id) =>
                !sourceIds.has(id) &&
                !destinationIds.has(id) &&
                categoryById.get(id)?.kind === kind,
            ).length;
            demand(
              remainingInKind + 1 <= (kind === "PRIMARY" ? 20 : 100),
              "La fusión excedería el límite de categorías de un inventario. Revisa sus categorías antes de fusionar.",
            );
            if (member.item) {
              itemIds.push(member.id);
              itemWrites.push({ itemId: member.id, categoryId: targetId });
            } else {
              aliasIds.push(member.id);
              aliasWrites.push({ aliasId: member.id, categoryId: targetId });
            }
          }
          affected++;
        }
        const replacedIds = [...new Set([...sourceIds, ...destinationIds])];
        await tx.metaInventoryCategoryAssignment.deleteMany({
          where: { aliasId: { in: aliasIds }, categoryId: { in: replacedIds } },
        });
        await tx.metaInventoryItemCategory.deleteMany({
          where: { itemId: { in: itemIds }, categoryId: { in: replacedIds } },
        });
        if (aliasWrites.length)
          await tx.metaInventoryCategoryAssignment.createMany({
            data: aliasWrites,
            skipDuplicates: true,
          });
        if (itemWrites.length)
          await tx.metaInventoryItemCategory.createMany({
            data: itemWrites,
            skipDuplicates: true,
          });
        const mappedId = (id: string) =>
          sourceIds.has(id)
            ? targetByKind.get(categoryById.get(id)!.kind)!
            : id;
        const links = before.relations
          .filter(
            (r) => sourceIds.has(r.primaryId) || sourceIds.has(r.secondaryId),
          )
          .map((r) => ({
            primaryId: mappedId(r.primaryId),
            secondaryId: mappedId(r.secondaryId),
          }))
          .filter(
            (r) =>
              r.primaryId !== r.secondaryId &&
              !(
                targetByKind.get("PRIMARY") === r.primaryId &&
                targetByKind.get("SECONDARY") === r.secondaryId
              ),
          );
        if (links.length)
          await tx.metaInventoryCategoryRelation.createMany({
            data: links,
            skipDuplicates: true,
          });
        const retained = new Set(targetByKind.values());
        await tx.metaInventoryCategory.deleteMany({
          where: {
            id: { in: [...sourceIds].filter((id) => !retained.has(id)) },
          },
        });
        for (const id of retained)
          await tx.metaInventoryCategory.update({
            where: { id },
            data: { name: finalName, key: categoryIdentity(finalName) },
          });
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
        const uniqueChosen = categoryAssignmentTags(
          before.categories,
          [],
          chosen.map((c) => c.id),
        );
        for (const kind of ["PRIMARY", "SECONDARY"])
          demand(
            before.categories.filter(
              (c) => uniqueChosen.includes(c.id) && c.kind === kind,
            ).length <= (kind === "SECONDARY" ? 100 : 20),
            "Un ítem admite hasta 20 categorías principales y 100 secundarias.",
          );
        await writeInventoryTags(tx, b.ids, uniqueChosen, true);
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
            ...(b.action === "ASSIGN_BULK"
              ? { kind: b.kind, names: b.names, ids: b.ids }
              : {}),
            ...(b.action === "RENAME"
              ? { categoryId: b.categoryId, name: b.name }
              : {}),
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
