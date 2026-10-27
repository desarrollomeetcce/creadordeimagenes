import { db } from "../db";
import { ownerOnly } from "../auth";
import { AppError, demand } from "../errors";
import { recordActivity } from "../activity";
import { effectivenessLock } from "./effectiveness";
import { inventoryRows, type InventoryImportRow } from "./inventory-paste";
import { categoryKey, splitCategoryNames } from "./category-paste";
import type { Actor } from "./service";
/** Additive import: preserve existing identities and financial values, reject cross-list collisions. */
export async function importInventory(
  actor: Actor,
  b: { listId: string; revision: number; rows: InventoryImportRow[] },
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
        existing = await tx.metaAlias.findMany(),
        categories = await tx.metaInventoryCategory.findMany({
          where: { sheetId: b.listId },
        });
      const definitions = new Map(
        categories.map((c) => [c.kind + "|" + categoryKey(c.name), c]),
      );
      let count = existing.length,
        created = 0;
      const resolve = async (kind: "PRIMARY" | "SECONDARY", name: string) => {
        const k = kind + "|" + categoryKey(name);
        let c = definitions.get(k);
        if (!c) {
          demand(definitions.size < 1000, "Máximo 1000 categorías por lista.");
          c = await tx.metaInventoryCategory.create({
            data: { sheetId: b.listId, kind, name, key: categoryKey(name) },
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
        // An exact literal group must not merge case variants or another inventory list.
        const group = existing.filter(
          (a) => a.inventorySheetId === b.listId && a.name === row.name,
        );
        for (const tableId of tableIds) {
          let a = existing.find(
            (a) =>
              a.tableId === tableId &&
              categoryKey(a.name) === categoryKey(row.name),
          );
          if (a)
            demand(
              a.inventorySheetId === b.listId && a.name === row.name,
              "Existe un inventario con ese nombre en otra lista o con distinta escritura. Usa su nombre exacto.",
              409,
            );
          else {
            demand(
              count < 1000,
              "El catálogo admite hasta 1000 elementos de inventario.",
            );
            a = await tx.metaAlias.create({
              data: { name: row.name, tableId, inventorySheetId: b.listId },
            });
            existing.push(a);
            count++;
            created++;
            group.push(a);
          }
        }
        const primary: Awaited<ReturnType<typeof resolve>>[] = [],
          secondary: Awaited<ReturnType<typeof resolve>>[] = [];
        for (const name of splitCategoryNames(row.primary))
          primary.push(await resolve("PRIMARY", name));
        for (const name of splitCategoryNames(row.secondary))
          secondary.push(await resolve("SECONDARY", name));
        const chosen = [...primary, ...secondary];
        for (const a of group) {
          const old = await tx.metaInventoryCategoryAssignment.findMany({
            where: { aliasId: a.id },
            include: { category: true },
          });
          for (const kind of ["PRIMARY", "SECONDARY"])
            demand(
              new Set([
                ...old
                  .filter((x) => x.category.kind === kind)
                  .map((x) => x.categoryId),
                ...chosen.filter((x) => x.kind === kind).map((x) => x.id),
              ]).size <= 20,
              "Máximo 20 categorías por nivel e ítem.",
            );
          if (chosen.length)
            await tx.metaInventoryCategoryAssignment.createMany({
              data: chosen.map((c) => ({ aliasId: a.id, categoryId: c.id })),
              skipDuplicates: true,
            });
        }
        if (primary.length && secondary.length)
          await tx.metaInventoryCategoryRelation.createMany({
            data: primary.flatMap((p) =>
              secondary.map((s) => ({ primaryId: p.id, secondaryId: s.id })),
            ),
            skipDuplicates: true,
          });
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
          detail: { rows: rows.length, created },
        },
      });
      return { created, rows: rows.length };
    },
    { timeout: 60000 },
  );
}
