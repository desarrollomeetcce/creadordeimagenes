import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../lib/db";
import {
  inventoryCategories,
  saveInventoryCategories,
} from "../lib/meta-ads/inventory-categories";
test("Asignación masiva por nivel conserva otras categorías y mueve coincidencias sin duplicarlas", async (t) => {
  assert(
    process.env.DATABASE_URL?.includes("library_organization_test") &&
      process.env.DATABASE_URL.includes("/workspace/work/pgdata"),
    "Solo base sintética exclusiva",
  );
  const tag = randomUUID(),
    owner = await db.user.create({
      data: {
        name: "QA asignación",
        email: `assign-${tag}@example.test`,
        passwordHash: "synthetic",
        role: "OWNER",
        status: "APPROVED",
      },
    }),
    actor = { id: owner.id, role: owner.role };
  const lists = await Promise.all(
      [0, 1].map((n) =>
        db.metaEffectivenessSheet.create({
          data: { kind: "INVENTORY", name: `QA asignación ${tag} ${n}` },
        }),
      ),
    ),
    table = await db.metaAliasTable.create({
      data: { name: `QA asignación tabla ${tag}` },
    });
  const category = async (name: string, kind: string, listId = lists[0].id) =>
    db.metaInventoryCategory.create({
      data: { sheetId: listId, name, key: name, kind },
    });
  try {
    const [qp, qs, ep, ns] = await Promise.all([
      category("Calidad", "PRIMARY"),
      category("Calidad", "SECONDARY"),
      category("Electricidad", "PRIMARY"),
      category("Nutrición", "SECONDARY"),
    ]);
    const item = async (name: string, ids: string[], listId = lists[0].id) =>
      db.metaInventoryItem.create({
        data: {
          sheetId: listId,
          name,
          syllabi: [
            {
              id: "outline",
              title: "Conservar",
              scope: "Perú",
              content: "Temario intacto",
            },
          ],
          categories: { create: ids.map((categoryId) => ({ categoryId })) },
        },
      });
    const a = await item("A", [qs.id, ns.id]),
      b = await item("B", [qp.id]),
      untouched = await item("C", [qs.id]),
      foreign = await item("D", [], lists[1].id);
    const alias = await db.metaAlias.create({
        data: {
          name: a.name,
          tableId: table.id,
          inventorySheetId: lists[0].id,
          categoryAssignments: { create: { categoryId: qs.id } },
        },
      }),
      ids = [a.id, b.id, alias.id];
    await t.test(
      "Valida permiso, lista, grupos completos, categorías y selección antes de modificar",
      async () => {
        await assert.rejects(
          () =>
            saveInventoryCategories(
              { id: owner.id, role: "ADMIN" },
              {
                listId: lists[0].id,
                revision: 0,
                action: "ASSIGN_BULK",
                ids,
                kind: "PRIMARY",
                names: ["Calidad"],
              },
            ),
          /OWNER|permiso|acceso/i,
        );
        for (const invalid of [[a.id], [foreign.id], [a.id, a.id]])
          await assert.rejects(
            () =>
              saveInventoryCategories(actor, {
                listId: lists[0].id,
                revision: 0,
                action: "ASSIGN_BULK",
                ids: invalid,
                kind: "PRIMARY",
                names: ["Calidad"],
              }),
            /agrupación|selección/i,
          );
        await assert.rejects(
          () =>
            saveInventoryCategories(actor, {
              listId: lists[0].id,
              revision: 0,
              action: "ASSIGN_BULK",
              ids,
              kind: "PRIMARY",
              names: ["No existe"],
            }),
          /no disponible/i,
        );
      },
    );
    await t.test(
      "Asignar principal traslada la coincidencia secundaria en todos los seleccionados y conserva el resto",
      async () => {
        const state = await saveInventoryCategories(actor, {
          listId: lists[0].id,
          revision: 0,
          action: "ASSIGN_BULK",
          ids,
          kind: "PRIMARY",
          names: ["Calidad"],
        });
        for (const id of ids) {
          assert(state.assignments[id].includes(qp.id));
          assert(!state.assignments[id].includes(qs.id));
        }
        assert(state.assignments[a.id].includes(ns.id));
        assert.deepEqual(state.assignments[untouched.id], [qs.id]);
        assert.deepEqual(
          (
            await db.metaInventoryItem.findUniqueOrThrow({
              where: { id: a.id },
            })
          ).syllabi,
          a.syllabi,
        );
      },
    );
    await t.test(
      "Varias secundarias crean solo los niveles faltantes y repetir no duplica",
      async () => {
        let state = await saveInventoryCategories(actor, {
          listId: lists[0].id,
          revision: 1,
          action: "ASSIGN_BULK",
          ids,
          kind: "SECONDARY",
          names: ["Calidad", "Electricidad"],
        });
        const es = state.categories.find(
          (c) => c.kind === "SECONDARY" && c.name === "Electricidad",
        )!;
        assert(es);
        for (const id of ids) {
          assert(state.assignments[id].includes(qs.id));
          assert(state.assignments[id].includes(es.id));
          assert(!state.assignments[id].includes(qp.id));
          assert(!state.assignments[id].includes(ep.id));
        }
        const assignments = state.assignments;
        state = await saveInventoryCategories(actor, {
          listId: lists[0].id,
          revision: 2,
          action: "ASSIGN_BULK",
          ids,
          kind: "SECONDARY",
          names: ["Calidad", "Electricidad"],
        });
        assert.deepEqual(state.assignments, assignments);
        await assert.rejects(
          () =>
            saveInventoryCategories(actor, {
              listId: lists[0].id,
              revision: 1,
              action: "ASSIGN_BULK",
              ids,
              kind: "PRIMARY",
              names: ["Calidad"],
            }),
          /cambiaron/i,
        );
      },
    );
    await t.test(
      "Si excede el límite en un seleccionado se revierte toda la asignación",
      async () => {
        const extras = await Promise.all(
          Array.from({ length: 20 }, (_, n) =>
            category(`Extra ${n}`, "PRIMARY"),
          ),
        );
        await db.metaInventoryItemCategory.createMany({
          data: extras.map((c) => ({ itemId: a.id, categoryId: c.id })),
        });
        const before = await inventoryCategories(actor, lists[0].id);
        await assert.rejects(
          () =>
            saveInventoryCategories(actor, {
              listId: lists[0].id,
              revision: before.revision,
              action: "ASSIGN_BULK",
              ids,
              kind: "PRIMARY",
              names: ["Electricidad"],
            }),
          /20 categorías/i,
        );
        const after = await inventoryCategories(actor, lists[0].id);
        assert.deepEqual(after, before);
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
