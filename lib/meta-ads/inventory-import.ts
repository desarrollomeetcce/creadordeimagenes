import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import {
  syllabiSchema,
  type InventorySyllabus,
} from "./inventory-syllabi-policy";
import { db } from "../db";
import { ownerOnly } from "../auth";
import { AppError, demand } from "../errors";
import { recordActivity } from "../activity";
import { effectivenessLock } from "./effectiveness";
import {
  inventoryDraftRows,
  INVENTORY_IMPORT_LIMIT,
  type InventoryImportRow,
} from "./inventory-paste";
import {
  categoryKey,
  categoryIdentity,
  splitCategoryNames,
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
type PlannedItem = {
  id: string;
  name: string;
  syllabi: InventorySyllabus[];
  categories: Set<string>;
  fresh: boolean;
  changed: boolean;
};
async function batches<T>(rows: T[], write: (batch: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += 5000)
    await write(rows.slice(i, i + 5000));
}
/** Validate and plan first, then write in bounded batches in one transaction. Blank cells never invent data. */
export async function importInventory(
  actor: Actor,
  b: {
    listId: string;
    revision: number;
    rows: InventoryImportRow[];
    decisions?: InventoryNameDecision[];
  },
) {
  ownerOnly(actor);
  let rows: InventoryImportRow[];
  try {
    rows = inventoryDraftRows(b.rows);
  } catch (e) {
    throw new AppError((e as Error).message);
  }
  return db.$transaction(
    async (tx) => {
      await effectivenessLock(tx, actor);
      const list = await tx.metaEffectivenessSheet.findFirst({
        where: { id: b.listId, kind: "INVENTORY", archivedAt: null },
      });
      demand(list, "Inventario no disponible.", 404);
      demand(
        list.categoryRevision === b.revision,
        "El inventario cambió. Recarga antes de importar.",
        409,
      );
      const [tables, aliases, storedItems, storedCategories, assignments] =
        await Promise.all([
          tx.metaAliasTable.findMany(),
          tx.metaAlias.findMany(),
          tx.metaInventoryItem.findMany({
            where: { sheetId: b.listId },
            include: { categories: { select: { categoryId: true } } },
          }),
          tx.metaInventoryCategory.findMany({ where: { sheetId: b.listId } }),
          tx.metaInventoryCategoryAssignment.findMany({
            where: { alias: { inventorySheetId: b.listId } },
            select: { aliasId: true, categoryId: true },
          }),
        ]);
      const definitions = new Map(
          storedCategories.map((c) => [
            c.kind + "|" + categoryIdentity(c.name),
            c,
          ]),
        ),
        newDefinitions: typeof storedCategories = [];
      const items = new Map<string, PlannedItem>(
        storedItems.map((i) => [
          i.name,
          {
            id: i.id,
            name: i.name,
            syllabi: syllabiSchema.parse(i.syllabi),
            categories: new Set(i.categories.map((c) => c.categoryId)),
            fresh: false,
            changed: false,
          },
        ]),
      );
      const aliasTags = new Map<string, Set<string>>();
      for (const a of assignments) {
        const s = aliasTags.get(a.aliasId) ?? new Set<string>();
        s.add(a.categoryId);
        aliasTags.set(a.aliasId, s);
      }
      const newAliases: {
          id: string;
          name: string;
          tableId: string;
          inventorySheetId: string;
        }[] = [],
        relationKeys = new Set<string>(),
        relations: { primaryId: string; secondaryId: string }[] = [],
        plannedAliasTags = new Map<string, Set<string>>();
      const incomingTags = new Map<string, string[]>();
      let addedSyllabi = 0;
      const resolve = (kind: "PRIMARY" | "SECONDARY", name: string) => {
        name = resolveInventoryName(
          kind,
          name,
          [...definitions.values()]
            .filter((c) => c.kind === kind)
            .map((c) => c.name),
          b.decisions,
        );
        const k = kind + "|" + categoryIdentity(name);
        let c = definitions.get(k);
        if (!c) {
          demand(definitions.size < 1000, "Máximo 1000 categorías por lista.");
          c = {
            id: randomUUID(),
            sheetId: b.listId,
            kind,
            name,
            key: categoryIdentity(name),
          };
          definitions.set(k, c);
          newDefinitions.push(c);
        }
        return c;
      };
      for (const row of rows) {
        const tableIds = splitCategoryNames(row.sheets).map((name) => {
          const found = tables.filter(
            (t) => categoryKey(t.name) === categoryKey(name),
          );
          demand(found.length === 1, `Hoja no disponible o ambigua: ${name}.`);
          return found[0].id;
        });
        const primary = splitCategoryNames(row.primary).map((n) =>
            resolve("PRIMARY", n),
          ),
          secondary = splitCategoryNames(row.secondary, 100).map((n) =>
            resolve("SECONDARY", n),
          );
        for (const p of primary)
          for (const s of secondary) {
            const k = p.id + "|" + s.id;
            if (
              categoryKey(p.name) !== categoryKey(s.name) &&
              !relationKeys.has(k)
            ) {
              relations.push({ primaryId: p.id, secondaryId: s.id });
              relationKeys.add(k);
            }
          }
        if (!row.name) continue;
        const name = resolveInventoryName(
          "INVENTORY",
          row.name,
          [
            ...items.keys(),
            ...aliases
              .filter((a) => a.inventorySheetId === b.listId)
              .map((a) => a.name),
            ...newAliases.map((a) => a.name),
          ],
          b.decisions,
        );
        let item = items.get(name);
        if (!item) {
          demand(
            items.size < INVENTORY_IMPORT_LIMIT,
            "Máximo 1.500 ítems por lista de inventario.",
          );
          item = {
            id: randomUUID(),
            name,
            syllabi: [],
            categories: new Set(),
            fresh: true,
            changed: false,
          };
          items.set(name, item);
        }
        for (const s of row.syllabi ?? [])
          if (
            !item.syllabi.some(
              (old) =>
                old.id === s.id ||
                (old.scope === s.scope && old.content === s.content),
            )
          ) {
            item.syllabi.push(s);
            item.changed = true;
            addedSyllabi++;
          }
        demand(
          item.syllabi.length <= 50,
          `El inventario ${name} supera 50 temarios.`,
        );
        syllabiSchema.parse(item.syllabi);
        const group = [
          ...aliases.filter(
            (a) => a.inventorySheetId === b.listId && a.name === name,
          ),
          ...newAliases.filter((a) => a.name === name),
        ];
        for (const tableId of tableIds) {
          let a =
            aliases.find((a) => a.tableId === tableId && a.name === name) ??
            newAliases.find((a) => a.tableId === tableId && a.name === name);
          if (a)
            demand(
              a.inventorySheetId === b.listId,
              "Existe un inventario con ese nombre en otra lista. Usa su nombre exacto.",
              409,
            );
          else {
            demand(
              aliases.length + newAliases.length < 1500,
              "El catálogo admite hasta 1.500 asignaciones a hojas.",
            );
            a = { id: randomUUID(), name, tableId, inventorySheetId: b.listId };
            newAliases.push(a);
          }
          if (!group.some((g) => g.id === a.id)) group.push(a);
        }
        for (const a of group)
          for (const id of plannedAliasTags.get(a.id) ??
            aliasTags.get(a.id) ??
            [])
            item.categories.add(id);
        const incoming = [
          ...(incomingTags.get(item.id) ?? []),
          ...primary.map((c) => c.id),
          ...secondary.map((c) => c.id),
        ];
        incomingTags.set(item.id, incoming);
        item.categories = new Set(
          categoryAssignmentTags(
            definitions.values(),
            item.categories,
            incoming,
          ),
        );
        for (const kind of ["PRIMARY", "SECONDARY"])
          demand(
            [...definitions.values()].filter(
              (c) => c.kind === kind && item.categories.has(c.id),
            ).length <= (kind === "SECONDARY" ? 100 : 20),
            "Máximo 20 categorías principales y 100 secundarias por ítem.",
          );
        for (const a of group)
          plannedAliasTags.set(a.id, new Set(item.categories));
      }
      const planned = [...items.values()],
        fresh = planned.filter((i) => i.fresh),
        updates = planned.filter((i) => !i.fresh && i.changed);
      if (newDefinitions.length)
        await batches(newDefinitions, (data) =>
          tx.metaInventoryCategory.createMany({ data }),
        );
      if (fresh.length)
        await batches(
          fresh.map((i) => ({
            id: i.id,
            sheetId: b.listId,
            name: i.name,
            syllabi: i.syllabi,
            syllabusRevision: i.syllabi.length ? 1 : 0,
          })),
          (data) => tx.metaInventoryItem.createMany({ data }),
        );
      if (updates.length) {
        const payload = updates.map((i) => ({ id: i.id, syllabi: i.syllabi }));
        const count = await tx.$executeRaw(
          Prisma.sql`UPDATE "MetaInventoryItem" i SET syllabi=x.syllabi,"syllabusRevision"=i."syllabusRevision"+1 FROM jsonb_to_recordset(${JSON.stringify(payload)}::jsonb) AS x(id text,syllabi jsonb) WHERE i.id=x.id AND i."sheetId"=${b.listId}`,
        );
        demand(
          count === updates.length,
          "El inventario cambió. Recarga antes de importar.",
          409,
        );
      }
      if (newAliases.length)
        await batches(newAliases, (data) => tx.metaAlias.createMany({ data }));
      const itemTags = planned.flatMap((i) =>
          [...i.categories].map((categoryId) => ({ itemId: i.id, categoryId })),
        ),
        leafTags = [...plannedAliasTags].flatMap(([aliasId, ids]) =>
          [...ids].map((categoryId) => ({ aliasId, categoryId })),
        );
      const finalItemTags = new Map(planned.map((i) => [i.id, i.categories]));
      await removeCategoryTagPairs(
        tx,
        storedItems.flatMap((i) =>
          i.categories
            .filter((c) => !finalItemTags.get(i.id)!.has(c.categoryId))
            .map((c) => ({ itemId: i.id, categoryId: c.categoryId })),
        ),
        assignments.filter(
          (a) =>
            plannedAliasTags.has(a.aliasId) &&
            !plannedAliasTags.get(a.aliasId)!.has(a.categoryId),
        ),
      );
      if (itemTags.length)
        await batches(itemTags, (data) =>
          tx.metaInventoryItemCategory.createMany({
            data,
            skipDuplicates: true,
          }),
        );
      if (leafTags.length)
        await batches(leafTags, (data) =>
          tx.metaInventoryCategoryAssignment.createMany({
            data,
            skipDuplicates: true,
          }),
        );
      if (relations.length)
        await batches(relations, (data) =>
          tx.metaInventoryCategoryRelation.createMany({
            data,
            skipDuplicates: true,
          }),
        );
      await tx.metaEffectivenessSheet.update({
        where: { id: b.listId },
        data: { categoryRevision: { increment: 1 } },
      });
      await recordActivity(tx, {
        data: {
          actorId: actor.id,
          action: "META_INVENTARIO_IMPORTADO",
          resourceId: b.listId,
          detail: {
            rows: rows.length,
            created: fresh.length,
            linked: newAliases.length,
            addedSyllabi,
          },
        },
      });
      return {
        created: fresh.length,
        linked: newAliases.length,
        rows: rows.length,
        addedSyllabi,
      };
    },
    { timeout: 120000 },
  );
}
