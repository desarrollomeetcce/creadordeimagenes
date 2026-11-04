import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../lib/db";
import {
  inventoryActivationDirectory,
  inventoryActivationReport,
} from "../lib/meta-ads/inventory-sheet-activation";
import { categoryKey } from "../lib/meta-ads/category-paste";
test("Sincronización guardada: directorio y evaluación coinciden sin depender de ventas o moneda inferida", async (t) => {
  assert(
    process.env.DATABASE_URL?.includes("library_organization_test") &&
      process.env.DATABASE_URL.includes("/workspace/work/pgdata"),
    "Solo DB QA",
  );
  const tag = randomUUID(),
    owner = await db.user.create({
      data: {
        name: "QA Sync status",
        email: tag + "@example.test",
        role: "OWNER",
        status: "APPROVED",
        passwordHash: "synthetic",
      },
    }),
    actor = { id: owner.id, role: owner.role };
  const list = await db.metaEffectivenessSheet.create({
      data: { name: "QA Status " + tag, kind: "INVENTORY" },
    }),
    advisorList = await db.metaEffectivenessSheet.create({
      data: { name: "QA Advisor " + tag, kind: "ADVISORS" },
    }),
    advisor = await db.metaAdvisor.create({
      data: { name: "QA Advisor", sheetId: advisorList.id },
    }),
    table = await db.metaAliasTable.create({
      data: {
        name: "QA Status " + tag,
        defaultCountry: "PE",
        defaultCurrency: "PEN",
      },
    });
  const alias = await db.metaAlias.create({
      data: {
        tableId: table.id,
        inventorySheetId: list.id,
        name: "Diplomado " + tag,
      },
    }),
    row = await db.metaEffectivenessRow.create({
      data: {
        aliasId: alias.id,
        country: "PE",
        currency: "",
        displayCurrency: "PEN",
        advisorId: advisor.id,
        days: { create: { day: "2026-11-01", sales: 3 } },
      },
    });
  await db.metaEffectivenessState.create({
    data: { aliasId: alias.id, country: "PE", active: false },
  });
  const key = JSON.stringify([categoryKey(alias.name), table.id, "PE"]);
  async function ready() {
    const directory = await inventoryActivationDirectory(actor, {
        listId: list.id,
      }),
      report = await inventoryActivationReport(actor, {
        listId: list.id,
        tableIds: table.id,
        byCountry: "true",
      });
    return {
      directory: directory.synchronization[key].ready,
      report: report.rows.find((r) => r.country === "PE")!.synchronizationReady,
    };
  }
  try {
    await t.test(
      "Configuración completa sigue sincronizada aunque no haya informe Meta",
      async () =>
        assert.deepEqual(await ready(), { directory: true, report: true }),
    );
    await t.test(
      "Moneda de tabla inferida no sustituye moneda guardada pendiente",
      async () => {
        await db.metaEffectivenessRow.update({
          where: { id: row.id },
          data: { displayCurrency: "" },
        });
        assert.deepEqual(await ready(), { directory: false, report: false });
      },
    );
    await t.test(
      "Configuración cambia después de guardar, no por refrescar las cifras",
      async () => {
        await db.metaEffectivenessRow.update({
          where: { id: row.id },
          data: { displayCurrency: "PEN" },
        });
        assert.deepEqual(await ready(), { directory: true, report: true });
        await db.metaEffectivenessSheet.update({
          where: { id: list.id },
          data: {
            config: {
              inventoryActivation: {
                rows: {
                  [alias.id + "|PE"]: {
                    advisorReviews: [
                      {
                        advisorId: advisor.id,
                        name: advisor.name,
                        createdAt: new Date().toISOString(),
                      },
                    ],
                  },
                },
              },
            },
          },
        });
        assert.deepEqual(await ready(), { directory: false, report: false });
        assert.equal(
          (
            await db.metaEffectivenessDay.findFirstOrThrow({
              where: { rowId: row.id },
            })
          ).sales,
          3,
        );
      },
    );
    await t.test("Autorización se revalida en cada lectura", async () => {
      await db.user.update({ where: { id: owner.id }, data: { role: "USER" } });
      await assert.rejects(
        inventoryActivationDirectory(actor, { listId: list.id }),
        { status: 403 },
      );
      await assert.rejects(
        inventoryActivationReport(actor, {
          listId: list.id,
          tableIds: table.id,
        }),
        { status: 403 },
      );
    });
  } finally {
    await db.metaEffectivenessRow.delete({ where: { id: row.id } });
    await db.metaAlias.delete({ where: { id: alias.id } });
    await db.metaAliasTable.delete({ where: { id: table.id } });
    await db.metaAdvisor.delete({ where: { id: advisor.id } });
    await db.metaEffectivenessSheet.deleteMany({
      where: { id: { in: [list.id, advisorList.id] } },
    });
    await db.user.delete({ where: { id: owner.id } });
    await db.$disconnect();
  }
});
