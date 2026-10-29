import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../lib/db";
import { linkInventorySheets } from "../lib/meta-ads/inventory-import";
import { inventoryCategories } from "../lib/meta-ads/inventory-categories";

test("Vincular hojas desde una celda es atómico, por ID y sin alterar historiales", async (t) => {
  assert(
    process.env.DATABASE_URL?.includes("library_organization_test") &&
      process.env.DATABASE_URL.includes("/workspace/work/pgdata"),
    "Solo base sintética exclusiva",
  );
  const tag = randomUUID(),
    owner = await db.user.create({
      data: {
        name: "QA Hojas manuales",
        email: `sheet-link-${tag}@example.test`,
        passwordHash: "synthetic",
        role: "OWNER",
        status: "APPROVED",
      },
    }),
    actor = { id: owner.id, role: owner.role };
  const lists = await Promise.all(
    [0, 1].map((n) =>
      db.metaEffectivenessSheet.create({
        data: { kind: "INVENTORY", name: `QA vínculos ${tag} ${n}` },
      }),
    ),
  );
  const tables = await Promise.all(
    ["Ventas, Perú", "Hoja nueva", "Histórico", "Conflicto"].map((name) =>
      db.metaAliasTable.create({
        data: {
          name: `${name} ${tag}`,
          defaultCountry: "PE",
          defaultCurrency: "PEN",
        },
      }),
    ),
  );
  const [sp, ss] = await Promise.all(
    ["PRIMARY", "SECONDARY"].map((kind) =>
      db.metaInventoryCategory.create({
        data: { sheetId: lists[0].id, kind, name: "Sistemas", key: "Sistemas" },
      }),
    ),
  );
  const outline = [
    {
      id: "outline",
      title: "Original",
      scope: "Perú",
      content: "Contenido conservado",
    },
  ];
  const source = await db.metaInventoryItem.create({
    data: {
      sheetId: lists[0].id,
      name: "Diplomado prueba",
      syllabi: outline,
      categories: { create: [sp, ss].map((c) => ({ categoryId: c.id })) },
    },
  });
  const old = await db.metaAlias.create({
      data: {
        name: source.name,
        tableId: tables[2].id,
        inventorySheetId: lists[0].id,
        categoryAssignments: { create: { categoryId: ss.id } },
      },
    }),
    foreign = await db.metaInventoryItem.create({
      data: { sheetId: lists[1].id, name: "Ajeno" },
    });
  const collision = await db.metaAlias.create({
    data: {
      name: source.name,
      tableId: tables[3].id,
      inventorySheetId: lists[1].id,
    },
  });
  const history = await db.metaEffectivenessRow.create({
    data: {
      aliasId: old.id,
      country: "PE",
      currency: "PEN",
      displayCurrency: "PEN",
      days: { create: { day: "2026-10-28", sales: 7, salesOverridden: true } },
    },
    include: { days: true },
  });
  const body = {
    listId: lists[0].id,
    revision: 0,
    inventoryId: source.id,
    expectedName: source.name,
    tableIds: [tables[0].id, tables[1].id],
  };
  try {
    await t.test(
      "Permisos, lista, nombre, hojas y revisión se validan antes de crear vínculos",
      async () => {
        await assert.rejects(
          () => linkInventorySheets({ id: owner.id, role: "ADMIN" }, body),
          /OWNER|permiso/i,
        );
        await assert.rejects(
          () =>
            linkInventorySheets(actor, { ...body, inventoryId: foreign.id }),
          /no disponible/i,
        );
        await assert.rejects(
          () =>
            linkInventorySheets(actor, {
              ...body,
              expectedName: "Nombre obsoleto",
            }),
          /nombre.*cambió/i,
        );
        await assert.rejects(
          () =>
            linkInventorySheets(actor, {
              ...body,
              tableIds: [tables[0].id, "no-existe"],
            }),
          /hoja.*no.*disponible/i,
        );
        await assert.rejects(
          () =>
            linkInventorySheets(actor, {
              ...body,
              tableIds: [tables[0].id, tables[0].id],
            }),
          /hojas diferentes/i,
        );
        await assert.rejects(
          () => linkInventorySheets(actor, { ...body, revision: 99 }),
          /cambió/i,
        );
        assert.equal(
          await db.metaAlias.count({ where: { tableId: tables[0].id } }),
          0,
        );
      },
    );
    await t.test(
      "Seleccionar dos hojas, incluida una con coma, enlaza el diplomado sin duplicar categorías",
      async () => {
        const result = await linkInventorySheets(actor, body);
        assert.equal(result.created, 2);
        assert.equal(result.aliasIds.length, 2);
        const rows = await db.metaAlias.findMany({
          where: { id: { in: result.aliasIds } },
          include: { categoryAssignments: true },
        });
        assert.deepEqual(
          rows.map((a) => a.tableId).sort(),
          body.tableIds.sort(),
        );
        for (const alias of rows) {
          assert.equal(alias.inventorySheetId, lists[0].id);
          assert.equal(alias.name, source.name);
          assert.deepEqual(
            alias.categoryAssignments.map((c) => c.categoryId),
            [sp.id],
          );
        }
        assert.deepEqual(
          (
            await db.metaInventoryItem.findUniqueOrThrow({
              where: { id: source.id },
            })
          ).syllabi,
          outline,
        );
        assert.equal(
          await db.metaInventoryItemCategory.count({
            where: { itemId: source.id },
          }),
          2,
        );
      },
    );
    await t.test(
      "Repetir hojas ya enlazadas es idempotente; una revisión antigua no se aplica",
      async () => {
        const result = await linkInventorySheets(actor, {
          ...body,
          revision: 1,
        });
        assert.equal(result.created, 0);
        assert.equal(result.revision, 1);
        assert.equal(
          await db.metaAlias.count({
            where: { name: source.name, inventorySheetId: lists[0].id },
          }),
          3,
        );
        await assert.rejects(() => linkInventorySheets(actor, body), /cambió/i);
      },
    );
    await t.test(
      "Un conflicto con otro inventario impide todos los vínculos y no transfiere historia",
      async () => {
        const extra = await db.metaAliasTable.create({
          data: { name: "Hoja sin cambios " + tag },
        });
        tables.push(extra);
        await assert.rejects(
          () =>
            linkInventorySheets(actor, {
              ...body,
              revision: 1,
              tableIds: [extra.id, tables[3].id],
            }),
          /otro inventario/i,
        );
        assert.equal(
          await db.metaAlias.count({ where: { tableId: extra.id } }),
          0,
        );
        assert.equal(
          (await inventoryCategories(actor, lists[0].id)).revision,
          1,
        );
        assert.deepEqual(
          await db.metaAlias.findUniqueOrThrow({ where: { id: collision.id } }),
          collision,
        );
        assert.deepEqual(
          await db.metaEffectivenessRow.findUniqueOrThrow({
            where: { id: history.id },
            include: { days: true },
          }),
          history,
        );
      },
    );
    await t.test(
      "Los diplomados heredados con solo un vínculo también admiten otra hoja",
      async () => {
        const legacy = await db.metaAlias.create({
          data: {
            name: "Solo vínculo",
            tableId: tables[2].id,
            inventorySheetId: lists[0].id,
          },
        });
        const result = await linkInventorySheets(actor, {
          listId: lists[0].id,
          revision: 1,
          inventoryId: legacy.id,
          expectedName: legacy.name,
          tableIds: [tables[0].id],
        });
        assert.equal(result.created, 1);
        assert.equal(
          await db.metaInventoryItem.count({
            where: { sheetId: lists[0].id, name: legacy.name },
          }),
          0,
        );
        assert.equal(
          await db.metaAlias.count({
            where: { inventorySheetId: lists[0].id, name: legacy.name },
          }),
          2,
        );
      },
    );
  } finally {
    await db.metaEffectivenessRow.deleteMany({
      where: { alias: { inventorySheetId: { in: lists.map((s) => s.id) } } },
    });
    await db.metaAlias.deleteMany({
      where: { inventorySheetId: { in: lists.map((s) => s.id) } },
    });
    await db.metaAliasTable.deleteMany({
      where: { id: { in: tables.map((t) => t.id) } },
    });
    await db.metaInventoryItem.deleteMany({
      where: { sheetId: { in: lists.map((s) => s.id) } },
    });
    await db.metaEffectivenessSheet.deleteMany({
      where: { id: { in: lists.map((s) => s.id) } },
    });
  }
});
