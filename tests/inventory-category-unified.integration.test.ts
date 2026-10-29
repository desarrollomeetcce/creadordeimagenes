import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../lib/db";
import { saveInventoryCategories } from "../lib/meta-ads/inventory-categories";

test("Eliminar una categoría quita ambos usos sin afectar inventarios ni otras listas", async (t) => {
  assert(
    process.env.DATABASE_URL?.includes("library_organization_test") &&
      process.env.DATABASE_URL.includes("/workspace/work/pgdata"),
    "Solo base sintética exclusiva",
  );
  const tag = randomUUID();
  const owner = await db.user.create({
    data: {
      name: "QA categorías",
      email: `category-${tag}@example.test`,
      passwordHash: "synthetic-only",
      role: "OWNER",
      status: "APPROVED",
    },
  });
  const actor = { id: owner.id, role: owner.role };
  const lists = await Promise.all(
    [0, 1].map((n) =>
      db.metaEffectivenessSheet.create({
        data: { kind: "INVENTORY", name: `QA categorías ${tag} ${n}` },
      }),
    ),
  );
  try {
    const rows = await Promise.all(
      lists.flatMap((sheet, n) =>
        ["PRIMARY", "SECONDARY"].flatMap((kind) =>
          (n ? ["Nutrición"] : ["Nutrición", "Psicología"]).map((name) =>
            db.metaInventoryCategory.create({
              data: { sheetId: sheet.id, kind, name, key: name },
            }),
          ),
        ),
      ),
    );
    const nutrition = rows.filter(
      (c) => c.sheetId === lists[0].id && c.name === "Nutrición",
    );
    const psychology = rows.filter(
      (c) => c.sheetId === lists[0].id && c.name === "Psicología",
    );
    const outline = [
      {
        id: "outline",
        title: "Temario",
        scope: "Todo el mundo",
        content: "Contenido conservado",
      },
    ];
    const item = await db.metaInventoryItem.create({
      data: {
        sheetId: lists[0].id,
        name: "Curso",
        syllabi: outline,
        categories: {
          create: [...nutrition, psychology[0]].map((c) => ({
            categoryId: c.id,
          })),
        },
      },
    });
    await t.test(
      "Identificadores de otra lista y revisiones antiguas no eliminan categorías",
      async () => {
        const foreign = rows.find((c) => c.sheetId === lists[1].id)!;
        await assert.rejects(
          () =>
            saveInventoryCategories(actor, {
              listId: lists[0].id,
              revision: 0,
              action: "DELETE",
              categoryId: foreign.id,
            }),
          /no disponible/i,
        );
        assert.equal(
          await db.metaInventoryCategory.count({
            where: { sheetId: lists[0].id },
          }),
          4,
        );
      },
    );
    await t.test(
      "DELETE de un uso elimina también el otro y conserva el contenido",
      async () => {
        await saveInventoryCategories(actor, {
          listId: lists[0].id,
          revision: 0,
          action: "DELETE",
          categoryId: nutrition[0].id,
        });
        assert.equal(
          await db.metaInventoryCategory.count({
            where: { sheetId: lists[0].id, name: "Nutrición" },
          }),
          0,
        );
        assert.equal(
          await db.metaInventoryCategory.count({
            where: { sheetId: lists[1].id, name: "Nutrición" },
          }),
          2,
        );
        const saved = await db.metaInventoryItem.findUniqueOrThrow({
          where: { id: item.id },
          include: { categories: true },
        });
        assert.deepEqual(saved.syllabi, outline);
        assert.equal(saved.categories.length, 1);
        await assert.rejects(
          () =>
            saveInventoryCategories(actor, {
              listId: lists[0].id,
              revision: 0,
              action: "DELETE",
              categoryId: psychology[0].id,
            }),
          /cambiaron/i,
        );
      },
    );
    await t.test(
      "DELETE_MANY también expande ambos usos aunque reciba solo el secundario",
      async () => {
        await saveInventoryCategories(actor, {
          listId: lists[0].id,
          revision: 1,
          action: "DELETE_MANY",
          categoryIds: [psychology.find((c) => c.kind === "SECONDARY")!.id],
        });
        assert.equal(
          await db.metaInventoryCategory.count({
            where: { sheetId: lists[0].id },
          }),
          0,
        );
        assert.equal(
          await db.metaInventoryItem.count({ where: { sheetId: lists[0].id } }),
          1,
        );
      },
    );
  } finally {
    await db.metaInventoryItem.deleteMany({
      where: { sheetId: { in: lists.map((s) => s.id) } },
    });
    await db.metaEffectivenessSheet.deleteMany({
      where: { id: { in: lists.map((s) => s.id) } },
    });
  }
});
