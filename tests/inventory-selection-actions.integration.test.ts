import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../lib/db";
import { linkInventorySheetsBatch } from "../lib/meta-ads/inventory-import";
import {
  inventoryCategories,
  saveInventoryCategories,
} from "../lib/meta-ads/inventory-categories";
import {
  previewRemoveInventorySelection,
  removeInventorySelection,
} from "../lib/meta-ads/inventory-catalog";
test("Selección explícita: asignar hojas, limpiar categorías y retirar hojas preservando catálogo", async () => {
  assert(
    process.env.DATABASE_URL?.includes("library_organization_test") &&
      process.env.DATABASE_URL.includes("/workspace/work/pgdata"),
  );
  const tag = randomUUID();
  const user = await db.user.create({
    data: {
      name: "QA selección",
      email: tag + "@example.test",
      role: "OWNER",
      status: "APPROVED",
      passwordHash: "synthetic",
    },
  });
  const actor = { id: user.id, role: user.role };
  const list = await db.metaEffectivenessSheet.create({
    data: { name: tag, kind: "INVENTORY" },
  });
  const tables = await Promise.all(
    [0, 1].map((i) => db.metaAliasTable.create({ data: { name: tag + i } })),
  );
  try {
    const categories = await Promise.all(
      ["PRIMARY", "SECONDARY"].map((kind) =>
        db.metaInventoryCategory.create({
          data: { sheetId: list.id, name: kind, key: kind, kind },
        }),
      ),
    );
    const items = await Promise.all(
      [0, 1, 2].map((i) =>
        db.metaInventoryItem.create({
          data: {
            sheetId: list.id,
            name: "Tema " + i + tag,
            categories: {
              create: categories.map((c) => ({ categoryId: c.id })),
            },
          },
        }),
      ),
    );
    const result = await linkInventorySheetsBatch(actor, {
      listId: list.id,
      revision: 0,
      items: items
        .slice(0, 2)
        .map((i) => ({ inventoryId: i.id, expectedName: i.name })),
      tableIds: [tables[0].id],
    });
    assert.equal(result.items, 2);
    assert.equal(result.created, 2);
    assert.equal(
      await db.metaAlias.count({ where: { name: items[2].name } }),
      0,
    );
    const aliases = await db.metaAlias.findMany({
      where: { inventorySheetId: list.id },
    });
    let state = await inventoryCategories(actor, list.id);
    const selected = [
      items[0].id,
      aliases.find((a) => a.name === items[0].name)!.id,
    ];
    await saveInventoryCategories(actor, {
      listId: list.id,
      revision: state.revision,
      action: "CLEAR_BULK",
      kind: "PRIMARY",
      ids: selected,
    });
    state = await inventoryCategories(actor, list.id);
    for (const id of selected) {
      assert(!state.assignments[id].includes(categories[0].id));
      assert(state.assignments[id].includes(categories[1].id));
    }
    assert(state.assignments[items[1].id].includes(categories[0].id));
    assert.equal(state.categories.length, 2);
    await saveInventoryCategories(actor, {
      listId: list.id,
      revision: state.revision,
      action: "CLEAR_BULK",
      kind: "SECONDARY",
      ids: selected,
    });
    state = await inventoryCategories(actor, list.id);
    assert.equal(state.assignments[items[0].id].length, 0);
    assert.equal(state.assignments[items[1].id].length, 2);
    await assert.rejects(
      saveInventoryCategories(actor, {
        listId: list.id,
        revision: state.revision,
        action: "CLEAR_BULK",
        kind: "PRIMARY",
        ids: [...selected, "foreign"],
      }),
    );
    const legacy = await db.metaAlias.create({
      data: {
        name: "Solo hoja " + tag,
        tableId: tables[1].id,
        inventorySheetId: list.id,
        categoryAssignments: { create: { categoryId: categories[0].id } },
      },
    });
    const ids = [aliases.find((a) => a.name === items[0].name)!.id, legacy.id];
    const preview = await previewRemoveInventorySelection(actor, list.id, ids);
    await assert.rejects(
      removeInventorySelection(actor, {
        listId: list.id,
        preserveCatalog: true,
        entries: preview.items.map((i, n) => ({
          id: i.id,
          token: n ? "0".repeat(64) : i.token,
        })),
      }),
    );
    assert.equal(await db.metaAlias.count({ where: { id: { in: ids } } }), 2);
    await removeInventorySelection(actor, {
      listId: list.id,
      preserveCatalog: true,
      entries: preview.items.map((i) => ({ id: i.id, token: i.token })),
    });
    assert.equal(await db.metaAlias.count({ where: { id: { in: ids } } }), 2);
    assert(
      await db.metaInventoryItem.findUnique({ where: { id: items[0].id } }),
    );
    const kept = await db.metaInventoryItem.findFirstOrThrow({
      where: { sheetId: list.id, name: legacy.name },
      include: { categories: true },
    });
    assert(kept.categories.some((c) => c.categoryId === categories[0].id));
    assert.equal(
      await db.metaAlias.count({
        where: { id: aliases.find((a) => a.name === items[1].name)!.id },
      }),
      1,
    );
  } finally {
    await db.metaEffectivenessRow.deleteMany({
      where: { alias: { inventorySheetId: list.id } },
    });
    await db.metaAlias.deleteMany({ where: { inventorySheetId: list.id } });
    await db.metaInventoryItem.deleteMany({ where: { sheetId: list.id } });
    await db.metaInventoryCategory.deleteMany({ where: { sheetId: list.id } });
    await db.metaEffectivenessSheet.delete({ where: { id: list.id } });
    await db.metaAliasTable.deleteMany({
      where: { id: { in: tables.map((t) => t.id) } },
    });
    await db.auditEvent.deleteMany({ where: { actorId: user.id } });
    await db.user.delete({ where: { id: user.id } });
  }
});
