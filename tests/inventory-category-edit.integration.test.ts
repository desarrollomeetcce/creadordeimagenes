import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../lib/db";
import {
  inventoryCategories,
  saveInventoryCategories,
} from "../lib/meta-ads/inventory-categories";

test("Editar y fusionar categorías conserva clasificaciones y deduplica por inventario", async (t) => {
  assert(
    process.env.DATABASE_URL?.includes("library_organization_test") &&
      process.env.DATABASE_URL.includes("/workspace/work/pgdata"),
    "Solo base sintética exclusiva",
  );
  const tag = randomUUID(),
    owner = await db.user.create({
      data: {
        name: "QA edición categorías",
        email: `edit-${tag}@example.test`,
        passwordHash: "synthetic",
        role: "OWNER",
        status: "APPROVED",
      },
    }),
    actor = { id: owner.id, role: owner.role };
  const lists = await Promise.all(
    [0, 1].map((n) =>
      db.metaEffectivenessSheet.create({
        data: { kind: "INVENTORY", name: `QA fusión ${tag} ${n}` },
      }),
    ),
  );
  const table = await db.metaAliasTable.create({
    data: { name: `QA tabla ${tag}` },
  });
  try {
    const category = async (name: string, kind: string, listId = lists[0].id) =>
      db.metaInventoryCategory.create({
        data: { sheetId: listId, name, key: name, kind },
      });
    const [sp, ss, tp, ts, quality, empty, foreign] = await Promise.all([
      category("Circuitos eléctricos", "PRIMARY"),
      category("Circuitos eléctricos", "SECONDARY"),
      category("Electricidad", "PRIMARY"),
      category("Electricidad", "SECONDARY"),
      category("Calidad", "SECONDARY"),
      category("Sin uso", "SECONDARY"),
      category("Circuitos eléctricos", "PRIMARY", lists[1].id),
    ]);
    const outline = [
      {
        id: "outline",
        title: "Temario",
        scope: "Perú",
        content: "Unidad conservada",
      },
    ];
    const item = async (name: string, ids: string[]) =>
      db.metaInventoryItem.create({
        data: {
          sheetId: lists[0].id,
          name,
          syllabi: outline,
          categories: { create: ids.map((categoryId) => ({ categoryId })) },
        },
      });
    const a = await item("A destino principal", [ss.id, tp.id, quality.id]),
      b = await item("B destino secundario", [sp.id, ts.id]),
      c = await item("C fuente duplicada", [sp.id, ss.id]),
      d = await item("D fuente secundaria", [ss.id]),
      e = await item("E compartido en hojas", [sp.id]),
      untouched = await item("F sin cambios", [quality.id]);
    const alias = await db.metaAlias.create({
      data: {
        tableId: table.id,
        inventorySheetId: lists[0].id,
        name: e.name,
        categoryAssignments: { create: { categoryId: ts.id } },
      },
    });
    await db.metaInventoryCategoryRelation.create({
      data: { primaryId: sp.id, secondaryId: quality.id },
    });
    await t.test(
      "Valida permisos, lista de origen y nombre antes de cambiar datos",
      async () => {
        await assert.rejects(
          () =>
            saveInventoryCategories(
              { id: owner.id, role: "ADMIN" },
              {
                listId: lists[0].id,
                revision: 0,
                action: "RENAME",
                categoryId: sp.id,
                name: "Otra",
              },
            ),
          /OWNER|permiso/i,
        );
        await assert.rejects(
          () =>
            saveInventoryCategories(actor, {
              listId: lists[0].id,
              revision: 0,
              action: "RENAME",
              categoryId: foreign.id,
              name: "Otra",
            }),
          /no disponible/i,
        );
        await assert.rejects(
          () =>
            saveInventoryCategories(actor, {
              listId: lists[0].id,
              revision: 0,
              action: "RENAME",
              categoryId: sp.id,
              name: "A,B",
            }),
          /un solo nombre/i,
        );
      },
    );
    await t.test(
      "Si una combinación excede el límite de categorías, la fusión revierte por completo",
      async () => {
        const extras = await Promise.all(
          Array.from({ length: 20 }, (_, n) =>
            category(`Extra ${n}`, "PRIMARY"),
          ),
        );
        const limited = await item("Límite", [
          ss.id,
          ...extras.map((c) => c.id),
        ]);
        const linked = await db.metaAlias.create({
          data: {
            tableId: table.id,
            inventorySheetId: lists[0].id,
            name: limited.name,
            categoryAssignments: { create: { categoryId: sp.id } },
          },
        });
        try {
          await assert.rejects(
            () =>
              saveInventoryCategories(actor, {
                listId: lists[0].id,
                revision: 0,
                action: "RENAME",
                categoryId: sp.id,
                name: "Electricidad",
              }),
            /límite/i,
          );
          assert(
            await db.metaInventoryCategory.findUnique({ where: { id: sp.id } }),
          );
          assert.equal(
            (await inventoryCategories(actor, lists[0].id)).revision,
            0,
          );
          assert.equal(
            await db.metaInventoryItemCategory.count({
              where: { itemId: limited.id },
            }),
            21,
          );
        } finally {
          await db.metaAlias.delete({ where: { id: linked.id } });
          await db.metaInventoryItem.delete({ where: { id: limited.id } });
          await db.metaInventoryCategory.deleteMany({
            where: { id: { in: extras.map((c) => c.id) } },
          });
        }
      },
    );
    await t.test(
      "Fusionar preserva destino existente, hereda origen y elimina repetidos entre niveles y hojas",
      async () => {
        const state = await saveInventoryCategories(actor, {
          listId: lists[0].id,
          revision: 0,
          action: "RENAME",
          categoryId: sp.id,
          name: "Electricidad",
        });
        assert(
          !state.categories.some((c) => c.name === "Circuitos eléctricos"),
        );
        const targetIds = state.categories
          .filter((c) => c.name === "Electricidad")
          .map((c) => c.id);
        for (const [entity, expected] of [
          [a, tp.id],
          [b, ts.id],
          [c, tp.id],
          [d, ts.id],
          [e, ts.id],
          [alias, ts.id],
        ] as const) {
          assert.deepEqual(
            state.assignments[entity.id].filter((id) => targetIds.includes(id)),
            [expected],
          );
        }
        assert(state.assignments[a.id].includes(quality.id));
        assert.deepEqual(state.assignments[untouched.id], [quality.id]);
        assert.deepEqual(
          (
            await db.metaInventoryItem.findUniqueOrThrow({
              where: { id: e.id },
            })
          ).syllabi,
          outline,
        );
        assert(
          await db.metaInventoryCategory.findUnique({
            where: { id: foreign.id },
          }),
        );
        assert(
          await db.metaInventoryCategoryRelation.findUnique({
            where: {
              primaryId_secondaryId: {
                primaryId: tp.id,
                secondaryId: quality.id,
              },
            },
          }),
        );
      },
    );
    await t.test(
      "Una revisión antigua no puede aplicar una edición sobre el estado nuevo",
      async () => {
        await assert.rejects(
          () =>
            saveInventoryCategories(actor, {
              listId: lists[0].id,
              revision: 0,
              action: "RENAME",
              categoryId: tp.id,
              name: "Obsoleto",
            }),
          /cambiaron/i,
        );
      },
    );
    await t.test(
      "Renombrar a un nombre nuevo conserva todos los usos e identificadores comerciales",
      async () => {
        const state = await saveInventoryCategories(actor, {
          listId: lists[0].id,
          revision: 1,
          action: "RENAME",
          categoryId: tp.id,
          name: "Sistemas eléctricos",
        });
        assert(!state.categories.some((c) => c.name === "Electricidad"));
        assert.equal(
          state.categories.filter((c) => c.name === "Sistemas eléctricos")
            .length,
          2,
        );
        assert.equal(state.items.length, 6);
        assert(await db.metaAlias.findUnique({ where: { id: alias.id } }));
        for (const entity of [a, b, c, d, e, alias])
          assert.equal(
            state.assignments[entity.id].filter(
              (id) =>
                state.categories.find((c) => c.id === id)?.name ===
                "Sistemas eléctricos",
            ).length,
            1,
          );
      },
    );
    await t.test(
      "Cambio de mayúsculas y categoría sin inventarios también se guardan sin duplicarse",
      async () => {
        let state = await inventoryCategories(actor, lists[0].id);
        const id = state.categories.find(
          (c) => c.name === "Sistemas eléctricos",
        )!.id;
        state = await saveInventoryCategories(actor, {
          listId: lists[0].id,
          revision: state.revision,
          action: "RENAME",
          categoryId: id,
          name: "SISTEMAS ELÉCTRICOS",
        });
        assert.equal(
          state.categories.filter((c) => c.name === "SISTEMAS ELÉCTRICOS")
            .length,
          2,
        );
        state = await saveInventoryCategories(actor, {
          listId: lists[0].id,
          revision: state.revision,
          action: "RENAME",
          categoryId: empty.id,
          name: "Categoría renombrada",
        });
        assert(state.categories.some((c) => c.name === "Categoría renombrada"));
      },
    );
  } finally {
    await db.metaAlias.deleteMany({ where: { tableId: table.id } });
    await db.metaAliasTable.delete({ where: { id: table.id } });
    await db.metaInventoryItem.deleteMany({
      where: { sheetId: { in: lists.map((s) => s.id) } },
    });
    await db.metaEffectivenessSheet.deleteMany({
      where: { id: { in: lists.map((s) => s.id) } },
    });
  }
});
