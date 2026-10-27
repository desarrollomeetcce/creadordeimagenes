import { db } from "../db";
import { ownerOnly } from "../auth";
import { AppError, demand } from "../errors";
import { recordActivity } from "../activity";
import { effectivenessLock } from "./effectiveness";
import { inventoryRows, type InventoryImportRow } from "./inventory-paste";
import {
  categoryKey,
  categoryIdentity,
  splitCategoryNames,
} from "./category-paste";
import { writeInventoryTags } from "./inventory-categories";
import {
  resolveInventoryName,
  type InventoryNameDecision,
} from "./inventory-duplicates";
import type { Actor } from "./service";
/** Empty cells stay empty. A catalogue item can exist independently of source worksheets. */
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
    rows = inventoryRows(
      b.rows.map((r) => [r.primary, r.secondary, r.name, r.sheets]),
    );
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
      const tables = await tx.metaAliasTable.findMany(),
        aliases = await tx.metaAlias.findMany(),
        items = await tx.metaInventoryItem.findMany({
          where: { sheetId: b.listId },
        }),
        categories = await tx.metaInventoryCategory.findMany({
          where: { sheetId: b.listId },
        });
      const definitions = new Map(
        categories.map((c) => [c.kind + "|" + categoryIdentity(c.name), c]),
      );
      let created = 0,
        linked = 0;
      const resolve = async (kind: "PRIMARY" | "SECONDARY", name: string) => {
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
          c = await tx.metaInventoryCategory.create({
            data: {
              sheetId: b.listId,
              kind,
              name,
              key: categoryIdentity(name),
            },
          });
          definitions.set(k, c);
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
        const primary: Awaited<ReturnType<typeof resolve>>[] = [],
          secondary: Awaited<ReturnType<typeof resolve>>[] = [];
        for (const name of splitCategoryNames(row.primary))
          primary.push(await resolve("PRIMARY", name));
        for (const name of splitCategoryNames(row.secondary))
          secondary.push(await resolve("SECONDARY", name));
        if (primary.length && secondary.length)
          await tx.metaInventoryCategoryRelation.createMany({
            data: primary.flatMap((p) =>
              secondary.map((s) => ({ primaryId: p.id, secondaryId: s.id })),
            ),
            skipDuplicates: true,
          });
        if (!row.name) continue; // Category-only rows only define categories; never fabricate an inventory name.
        const inventoryName = resolveInventoryName(
          "INVENTORY",
          row.name,
          [
            ...items.map((i) => i.name),
            ...aliases
              .filter((a) => a.inventorySheetId === b.listId)
              .map((a) => a.name),
          ],
          b.decisions,
        );
        let item = items.find((i) => i.name === inventoryName);
        if (!item) {
          demand(
            items.length < 1000,
            "Máximo 1000 ítems por lista de inventario.",
          );
          item = await tx.metaInventoryItem.create({
            data: { sheetId: b.listId, name: inventoryName },
          });
          items.push(item);
          created++;
        }
        const group = aliases.filter(
          (a) => a.inventorySheetId === b.listId && a.name === inventoryName,
        );
        for (const tableId of tableIds) {
          let a = aliases.find(
            (a) => a.tableId === tableId && a.name === inventoryName,
          );
          if (a)
            demand(
              a.inventorySheetId === b.listId && a.name === inventoryName,
              "Existe un inventario con ese nombre en otra lista o con distinta escritura. Usa su nombre exacto.",
              409,
            );
          else {
            demand(
              aliases.length < 1000,
              "El catálogo admite hasta 1000 asignaciones a hojas.",
            );
            a = await tx.metaAlias.create({
              data: {
                name: inventoryName,
                tableId,
                inventorySheetId: b.listId,
              },
            });
            aliases.push(a);
            group.push(a);
            linked++;
          }
        }
        const old = await tx.metaInventoryCategoryAssignment.findMany({
            where: { aliasId: { in: group.map((a) => a.id) } },
          }),
          own = await tx.metaInventoryItemCategory.findMany({
            where: { itemId: item.id },
          });
        const chosen = [
          ...new Set([
            ...old.map((c) => c.categoryId),
            ...own.map((c) => c.categoryId),
            ...primary.map((c) => c.id),
            ...secondary.map((c) => c.id),
          ]),
        ];
        for (const kind of ["PRIMARY", "SECONDARY"])
          demand(
            [...definitions.values()].filter(
              (c) => c.kind === kind && chosen.includes(c.id),
            ).length <= 20,
            "Máximo 20 categorías por nivel e ítem.",
          );
        await writeInventoryTags(
          tx,
          [item.id, ...group.map((a) => a.id)],
          chosen,
        );
      }
      await tx.metaEffectivenessSheet.update({
        where: { id: b.listId },
        data: { categoryRevision: { increment: 1 } },
      });
      await recordActivity(tx, {
        data: {
          actorId: actor.id,
          action: "META_INVENTARIO_IMPORTADO",
          resourceId: b.listId,
          detail: { rows: rows.length, created, linked },
        },
      });
      return { created, linked, rows: rows.length };
    },
    { timeout: 60000 },
  );
}
