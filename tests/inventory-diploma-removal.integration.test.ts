import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../lib/db";
import {
  previewRemoveInventorySelection,
  removeInventorySelection,
} from "../lib/meta-ads/inventory-catalog";
import {
  inventoryTrials,
  saveInventoryTrial,
} from "../lib/meta-ads/inventory-trials";
import { authorizeFinancialRequest } from "../lib/meta-ads/financial-access";
import { categoryKey } from "../lib/meta-ads/category-paste";
import { limaDay } from "../lib/meta-ads/advisor-attribution";
import type { TrialPayload } from "../lib/meta-ads/inventory-trial-policy";

test("Eliminar diplomados elegidos desde grupos: alcance exacto, CAS y conservación de los demás", async (t) => {
  assert(
    process.env.DATABASE_URL?.includes("library_organization_test") &&
      process.env.DATABASE_URL.includes("/workspace/work/pgdata"),
    "Solo DB QA",
  );
  const tag = randomUUID(),
    owner = await db.user.create({
      data: {
        name: "QA eliminación",
        email: tag + "@example.test",
        passwordHash: "synthetic",
        role: "OWNER",
        status: "APPROVED",
      },
    }),
    editor = await db.user.create({
      data: {
        name: "QA editor",
        email: tag + "e@example.test",
        passwordHash: "synthetic",
        role: "USER",
        status: "APPROVED",
      },
    }),
    actor = { id: owner.id, role: owner.role };
  const list = await db.metaEffectivenessSheet.create({
      data: { name: tag, kind: "INVENTORY" },
    }),
    foreign = await db.metaEffectivenessSheet.create({
      data: { name: tag + "foreign", kind: "INVENTORY" },
    }),
    tables = await Promise.all(
      ["PE", "EC", "BO"].map((defaultCountry) =>
        db.metaAliasTable.create({
          data: { name: tag + defaultCountry, defaultCountry },
        }),
      ),
    );
  const category = await db.metaInventoryCategory.create({
    data: {
      sheetId: list.id,
      name: "Educación",
      key: "educacion",
      kind: "PRIMARY",
    },
  });
  const typo = await db.metaInventoryItem.create({
      data: { sheetId: list.id, name: "LECTOESCRITUA " + tag },
    }),
    other = await db.metaInventoryItem.create({
      data: { sheetId: list.id, name: "LECTOESCRITURA " + tag },
    }),
    correct = await db.metaInventoryItem.create({
      data: {
        sheetId: list.id,
        name: "Metodología para el aprendizaje lecto-escritura " + tag,
        categories: { create: { categoryId: category.id } },
      },
    }),
    foreignItem = await db.metaInventoryItem.create({
      data: { sheetId: foreign.id, name: tag + "foreign" },
    });
  const badAliases = await Promise.all(
      tables.slice(0, 2).map((table, index) =>
        db.metaAlias.create({
          data: {
            tableId: table.id,
            inventorySheetId: list.id,
            name: index ? typo.name.toLocaleLowerCase("es") : typo.name,
          },
        }),
      ),
    ),
    goodAlias = await db.metaAlias.create({
      data: {
        tableId: tables[0].id,
        inventorySheetId: list.id,
        name: correct.name,
        categoryAssignments: { create: { categoryId: category.id } },
      },
    });
  const badRow = await db.metaEffectivenessRow.create({
      data: {
        aliasId: badAliases[0].id,
        country: "PE",
        currency: "",
        days: { create: { day: limaDay(), sales: 2 } },
      },
    }),
    goodRow = await db.metaEffectivenessRow.create({
      data: {
        aliasId: goodAlias.id,
        country: "PE",
        currency: "",
        days: { create: { day: limaDay(), sales: 5 } },
      },
    });
  const group = await saveInventoryTrial(actor, {
    action: "CREATE",
    listId: list.id,
    name: "Grupo QA",
    itemIds: [typo.id, correct.id],
    countries: ["PE"],
    since: limaDay(),
    reserve: false,
    diverse: false,
    rules: { zero: 25, perSale: 50 },
  });
  assert("members" in group && typeof group.revision === "number");
  const originalRevision = group.revision;
  const before = JSON.parse(JSON.stringify(group)) as TrialPayload;
  let preview = await previewRemoveInventorySelection(
    actor,
    list.id,
    [typo.id],
    true,
  );
  const remove = (p: typeof preview) =>
    removeInventorySelection(actor, {
      listId: list.id,
      wholeDiplomas: true,
      catalogIds: [typo.id],
      entries: p.items.map((item) => ({ id: item.id, token: item.token })),
    });
  try {
    await t.test(
      "Vista previa une ficha y hojas del mismo nombre canónico; no sinónimos ni Educación",
      async () => {
        assert.equal(preview.items.length, 3);
        assert(
          preview.items.every(
            (item) => categoryKey(item.name) === categoryKey(typo.name),
          ),
        );
        assert(
          !preview.items.some(
            (item) => item.id === correct.id || item.id === other.id,
          ),
        );
        assert.equal(
          await db.metaInventoryItem.count({ where: { sheetId: list.id } }),
          3,
        );
      },
    );
    await t.test(
      "Una hoja nueva tras revisar invalida toda la eliminación sin borrar nada",
      async () => {
        await db.metaAlias.create({
          data: {
            tableId: tables[2].id,
            inventorySheetId: list.id,
            name: typo.name,
          },
        });
        await assert.rejects(remove(preview), { status: 409 });
        assert.equal(
          await db.metaAlias.count({ where: { inventorySheetId: list.id } }),
          4,
        );
        assert.equal(
          (
            await db.metaEffectivenessDay.findFirstOrThrow({
              where: { rowId: badRow.id },
            })
          ).sales,
          2,
        );
      },
    );
    await t.test(
      "Cambiar datos revisados también bloquea el lote completo",
      async () => {
        preview = await previewRemoveInventorySelection(
          actor,
          list.id,
          [typo.id],
          true,
        );
        await db.metaEffectivenessDay.update({
          where: { rowId_day: { rowId: badRow.id, day: limaDay() } },
          data: { sales: 3 },
        });
        await assert.rejects(remove(preview), { status: 409 });
        assert(
          await db.metaInventoryItem.findUnique({ where: { id: typo.id } }),
        );
        assert(
          await db.metaAlias.findUnique({ where: { id: badAliases[1].id } }),
        );
      },
    );
    await t.test(
      "Confirmar quita solo elegidos, limpia miembro activo y mantiene ciclos/diplomado correcto",
      async () => {
        const usageKey = JSON.stringify([categoryKey(typo.name), "PE"]),
          goodKey = JSON.stringify([categoryKey(correct.name), "PE"]);
        await db.metaEffectivenessSheet.update({
          where: { id: list.id },
          data: {
            config: {
              inventoryGroupUsage: {
                [usageKey]: { mode: "USED", revision: randomUUID() },
                [goodKey]: { mode: "UNUSED", revision: randomUUID() },
              },
              inventoryActivation: {
                rows: {
                  [badAliases[0].id + "|PE"]: { pinned: true },
                  [goodAlias.id + "|PE"]: { pinned: true },
                },
              },
            },
          },
        });
        preview = await previewRemoveInventorySelection(
          actor,
          list.id,
          [typo.id],
          true,
        );
        assert.equal(preview.items.length, 4);
        const result = await remove(preview);
        assert.equal(result.removed.length, 4);
        const directory = await inventoryTrials(actor, { listId: list.id });
        assert(
          !directory.catalog.some(
            (item) => categoryKey(item.name) === categoryKey(typo.name),
          ),
        );
        assert(directory.catalog.some((item) => item.id === other.id));
        assert(directory.catalog.some((item) => item.id === correct.id));
        assert.equal(
          (
            await db.metaEffectivenessDay.findFirstOrThrow({
              where: { rowId: goodRow.id },
            })
          ).sales,
          5,
        );
        assert.equal(
          await db.metaInventoryItemCategory.count({
            where: { itemId: correct.id },
          }),
          1,
        );
        const current = await db.metaInventoryTrialGroup.findUniqueOrThrow({
            where: { id: group.id },
          }),
          payload = current.payload as unknown as TrialPayload;
        assert.equal(current.revision, originalRevision + 1);
        assert.deepEqual(
          payload.members.map((m) => m.itemId),
          [correct.id],
        );
        assert(
          payload.cycles
            .filter((c) => c.itemId === typo.id)
            .every((c) => c.until),
        );
        assert.deepEqual(
          payload.cycles.filter((c) => c.itemId === correct.id),
          before.cycles.filter((c) => c.itemId === correct.id),
        );
        const config = (
          await db.metaEffectivenessSheet.findUniqueOrThrow({
            where: { id: list.id },
          })
        ).config as any;
        assert(!config.inventoryGroupUsage[usageKey]);
        assert(config.inventoryGroupUsage[goodKey]);
        assert(!config.inventoryActivation.rows[badAliases[0].id + "|PE"]);
        assert(config.inventoryActivation.rows[goodAlias.id + "|PE"]);
      },
    );
    await t.test(
      "Permiso, lista ajena y selección incompleta se rechazan",
      async () => {
        await assert.rejects(
          previewRemoveInventorySelection(
            actor,
            list.id,
            [foreignItem.id],
            true,
          ),
          { status: 409 },
        );
        await db.effectivenessGrant.create({
          data: {
            userId: editor.id,
            grantedById: owner.id,
            scope: "TAB:" + list.id,
            permission: "EDIT",
          },
        });
        const cap = await authorizeFinancialRequest(
          { id: editor.id, role: editor.role },
          "inventory/remove-preview",
          "POST",
          new URLSearchParams(),
          { listId: list.id, ids: [other.id], wholeDiplomas: true },
          "TAB:" + list.id,
        );
        await assert.rejects(
          previewRemoveInventorySelection(
            cap,
            foreign.id,
            [foreignItem.id],
            true,
          ),
          { status: 403 },
        );
        const p = await previewRemoveInventorySelection(
          actor,
          list.id,
          [correct.id],
          true,
        );
        await assert.rejects(
          removeInventorySelection(actor, {
            listId: list.id,
            wholeDiplomas: true,
            catalogIds: [correct.id],
            entries: p.items
              .slice(0, 1)
              .map((i) => ({ id: i.id, token: i.token })),
          }),
          { status: 409 },
        );
        await db.effectivenessGrant.deleteMany({
          where: { userId: editor.id },
        });
        await assert.rejects(
          previewRemoveInventorySelection(cap, list.id, [other.id], true),
          { status: 403 },
        );
      },
    );
  } finally {
    await db.metaEffectivenessRow.deleteMany({
      where: { alias: { inventorySheetId: list.id } },
    });
    await db.metaAlias.deleteMany({ where: { inventorySheetId: list.id } });
    await db.metaInventoryItem.deleteMany({
      where: { sheetId: { in: [list.id, foreign.id] } },
    });
    await db.metaInventoryCategory.deleteMany({ where: { sheetId: list.id } });
    await db.metaEffectivenessSheet.deleteMany({
      where: { id: { in: [list.id, foreign.id] } },
    });
    await db.metaAliasTable.deleteMany({
      where: { id: { in: tables.map((table) => table.id) } },
    });
    await db.effectivenessGrant.deleteMany({ where: { userId: editor.id } });
    await db.auditEvent.deleteMany({
      where: { actorId: { in: [owner.id, editor.id] } },
    });
    await db.user.deleteMany({ where: { id: { in: [owner.id, editor.id] } } });
    await db.$disconnect();
  }
});
