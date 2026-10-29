import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../lib/db";
import {
  inventoryCategories,
  saveInventoryCategories,
} from "../lib/meta-ads/inventory-categories";
import { importInventory } from "../lib/meta-ads/inventory-import";
import {
  previewCatalogPackage,
  importCatalogPackage,
  saveSyllabi,
} from "../lib/meta-ads/inventory-syllabi";
import { linkFinancialInventory } from "../lib/meta-ads/financial-inventory";

test("Las próximas escrituras de categorías no duplican nombres entre niveles; no hay limpieza global", async (t) => {
  assert(
    process.env.DATABASE_URL?.includes("library_organization_test") &&
      process.env.DATABASE_URL.includes("/workspace/work/pgdata"),
    "Solo base sintética exclusiva",
  );
  const tag = randomUUID(),
    owner = await db.user.create({
      data: {
        name: "QA categoría única",
        email: `unique-${tag}@example.test`,
        passwordHash: "synthetic",
        role: "OWNER",
        status: "APPROVED",
      },
    }),
    actor = { id: owner.id, role: owner.role };
  const list = await db.metaEffectivenessSheet.create({
      data: { kind: "INVENTORY", name: "QA categoría única " + tag },
    }),
    table = await db.metaAliasTable.create({
      data: { name: "QA única tabla " + tag },
    }),
    linkedTable = await db.metaAliasTable.create({
      data: { name: "QA única vínculo " + tag },
    });
  const category = async (name: string, kind: string) =>
    db.metaInventoryCategory.create({
      data: { sheetId: list.id, name, key: name, kind },
    });
  const [sp, ss, np, ns] = await Promise.all([
    category("Sistemas", "PRIMARY"),
    category("Sistemas", "SECONDARY"),
    category("Notas", "PRIMARY"),
    category("Notas", "SECONDARY"),
  ]);
  const outline = [
    {
      id: "outline",
      title: "Original",
      scope: "Perú",
      content: "Contenido intacto",
    },
  ];
  const item = async (name: string, ids: string[]) =>
    db.metaInventoryItem.create({
      data: {
        sheetId: list.id,
        name,
        syllabi: outline,
        categories: { create: ids.map((categoryId) => ({ categoryId })) },
      },
    });
  const a = await item("A", [sp.id, ss.id, np.id, ns.id]),
    legacy = await item("Legado sin editar", [sp.id, ss.id]),
    linked = await item("Legado para vincular", [sp.id, ss.id]),
    c = await item("C", []),
    alias = await db.metaAlias.create({
      data: {
        tableId: table.id,
        inventorySheetId: list.id,
        name: a.name,
        categoryAssignments: {
          create: [ss.id, np.id, ns.id].map((categoryId) => ({ categoryId })),
        },
      },
    });
  const ids = [a.id, alias.id];
  const current = () => inventoryCategories(actor, list.id);
  const save = async (action: any) =>
    saveInventoryCategories(actor, {
      listId: list.id,
      revision: (await current()).revision,
      ...action,
    });
  const expectOnly = async (entityIds: string[], target: string) => {
    const state = await current();
    for (const id of entityIds)
      assert.deepEqual(
        (state.assignments[id] ?? []).filter((id) =>
          [sp.id, ss.id].includes(id),
        ),
        [target],
      );
  };
  try {
    await t.test(
      "El + de principal/secundaria elimina solo el uso opuesto solicitado y no altera otros duplicados",
      async () => {
        await save({
          action: "IMPORT",
          rows: [{ primary: "", secondary: "Sistemas" }],
          targetIds: ids,
        });
        await expectOnly(ids, ss.id);
        let state = await current();
        assert(
          state.assignments[a.id].includes(np.id) &&
            state.assignments[a.id].includes(ns.id),
        );
        assert.deepEqual(
          state.assignments[legacy.id].sort(),
          [sp.id, ss.id].sort(),
        );
        await save({
          action: "IMPORT",
          rows: [{ primary: "Sistemas", secondary: "" }],
          targetIds: ids,
        });
        await expectOnly(ids, sp.id);
      },
    );
    await t.test(
      "Editar el nivel, arrastrar y enviar una selección completa aplican la misma regla",
      async () => {
        await save({
          action: "ASSIGN_LEVEL",
          ids,
          expectedName: a.name,
          kind: "SECONDARY",
          names: ["Sistemas", "Notas"],
        });
        await expectOnly(ids, ss.id);
        await save({
          action: "MOVE",
          ids,
          expectedName: a.name,
          categoryId: ss.id,
          toKind: "PRIMARY",
        });
        await expectOnly(ids, sp.id);
        await save({
          action: "ASSIGN",
          ids,
          expectedName: a.name,
          categoryIds: [ss.id, sp.id],
        });
        await expectOnly(ids, sp.id);
        assert.deepEqual(
          (await current()).assignments[legacy.id].sort(),
          [sp.id, ss.id].sort(),
        );
      },
    );
    await t.test(
      "Pegar o importar ambas columnas conserva principal; una asignación secundaria posterior mueve la categoría",
      async () => {
        await importInventory(actor, {
          listId: list.id,
          revision: (await current()).revision,
          rows: [
            {
              name: c.name,
              primary: "Sistemas",
              secondary: "Sistemas",
              sheets: "",
            },
          ],
        });
        await expectOnly([c.id], sp.id);
        await importInventory(actor, {
          listId: list.id,
          revision: (await current()).revision,
          rows: [
            { name: a.name, primary: "", secondary: "Sistemas", sheets: "" },
          ],
        });
        await expectOnly(ids, ss.id);
        assert.deepEqual(
          (await current()).assignments[legacy.id].sort(),
          [sp.id, ss.id].sort(),
        );
      },
    );
    await t.test(
      "Filas repetidas del mismo archivo tienen precedencia principal estable y reimportación idempotente",
      async () => {
        const rows = [
          { name: c.name, primary: "Sistemas", secondary: "", sheets: "" },
          { name: c.name, primary: "", secondary: "Sistemas", sheets: "" },
        ];
        for (const input of [rows, [...rows].reverse(), rows]) {
          await importInventory(actor, {
            listId: list.id,
            revision: (await current()).revision,
            rows: input,
          });
          await expectOnly([c.id], sp.id);
        }
      },
    );
    await t.test(
      "El catálogo preparado deduplica solo las fichas importadas y conserva temarios",
      async () => {
        const pkg = {
          format: "inventario-catalog-v1",
          targetName: list.name,
          categories: ["Sistemas"],
          items: [
            {
              name: a.name,
              primary: "Sistemas",
              secondary: ["Sistemas"],
              syllabi: [],
            },
            {
              name: "Ficha nueva",
              primary: "Sistemas",
              secondary: ["Sistemas"],
              syllabi: [],
            },
          ],
        };
        const preview = await previewCatalogPackage(actor, pkg);
        await importCatalogPackage(actor, {
          package: pkg,
          token: preview.token,
        });
        const state = await current();
        const fresh = state.items.find((i) => i.name === "Ficha nueva")!;
        await expectOnly([a.id, alias.id, fresh.id], sp.id);
        assert.deepEqual(
          (
            await db.metaInventoryItem.findUniqueOrThrow({
              where: { id: a.id },
            })
          ).syllabi,
          outline,
        );
        assert.deepEqual(
          state.assignments[legacy.id].sort(),
          [sp.id, ss.id].sort(),
        );
      },
    );
    await t.test(
      "Copiar a una nueva hoja no crea otra categoría con el mismo nombre en el nivel opuesto",
      async () => {
        await db.$transaction((tx) =>
          linkFinancialInventory(tx, linkedTable.id, list.id, [
            { name: linked.name, country: "PE", currency: "PEN" },
          ]),
        );
        const alias = await db.metaAlias.findFirstOrThrow({
          where: { tableId: linkedTable.id, name: linked.name },
        });
        await expectOnly([linked.id, alias.id], sp.id);
        assert.deepEqual(
          (await current()).assignments[legacy.id].sort(),
          [sp.id, ss.id].sort(),
        );
      },
    );
    await t.test(
      "Cambios sin categorías y categorías sin destinatarios no limpian los registros antiguos",
      async () => {
        await save({
          action: "IMPORT",
          rows: [{ primary: "Otra categoría", secondary: "" }],
        });
        await importInventory(actor, {
          listId: list.id,
          revision: (await current()).revision,
          rows: [{ name: c.name, primary: "", secondary: "", sheets: "" }],
        });
        await saveSyllabi(actor, {
          listId: list.id,
          name: legacy.name,
          revision: 0,
          syllabi: outline,
        });
        assert.deepEqual(
          (await current()).assignments[legacy.id].sort(),
          [sp.id, ss.id].sort(),
        );
        assert.deepEqual(
          (
            await db.metaInventoryItem.findUniqueOrThrow({
              where: { id: legacy.id },
            })
          ).syllabi,
          outline,
        );
      },
    );
  } finally {
    await db.metaAlias.deleteMany({ where: { inventorySheetId: list.id } });
    await db.metaAliasTable.deleteMany({
      where: { id: { in: [table.id, linkedTable.id] } },
    });
    await db.metaInventoryItem.deleteMany({ where: { sheetId: list.id } });
    await db.metaEffectivenessSheet.delete({ where: { id: list.id } });
  }
});
