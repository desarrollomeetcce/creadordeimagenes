import {
  inventoryActivationDirectory,
  inventoryActivationAddSheet,
} from "../lib/meta-ads/inventory-sheet-activation";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../lib/db";
import {
  previewHistoryImport,
  commitHistoryImport,
  type HistoryFile,
} from "../lib/meta-ads/financial-history-import";
import { effectiveness } from "../lib/meta-ads/effectiveness";
test("Recuperación histórica: solo faltantes, filas retiradas, inactivos y valores actuales protegidos", async (t) => {
  assert(
    process.env.DATABASE_URL?.includes("library_organization_test") &&
      process.env.DATABASE_URL.includes("/workspace/work/pgdata"),
  );
  const tag = randomUUID(),
    u = await db.user.create({
      data: {
        name: "Recovery QA",
        email: tag + "@example.test",
        passwordHash: "synthetic",
        role: "OWNER",
        status: "APPROVED",
      },
    }),
    lists = await Promise.all(
      ["INVENTORY", "ADVISORS", "TOTALS"].map((kind) =>
        db.metaEffectivenessSheet.create({
          data: { kind, name: "Recovery " + tag + " " + kind },
        }),
      ),
    ),
    table = await db.metaAliasTable.create({
      data: {
        name: "Recovery " + tag,
        defaultCountry: "PE",
        defaultCurrency: "PEN",
      },
    }),
    a = await db.metaAlias.create({
      data: {
        tableId: table.id,
        inventorySheetId: lists[0].id,
        name: "Criminalística internacional",
      },
    });
  await db.metaEffectivenessState.create({
    data: { aliasId: a.id, country: "PE", active: false },
  });
  const file: HistoryFile = {
      version: 1,
      source: {
        url: "https://example.test/source",
        title: tag,
        salesSince: "2026-10-01",
        salesUntil: "2026-10-30",
        marketingSince: "2026-10-13",
        marketingUntil: "2026-10-31",
        notes: [],
      },
      diplomas: [
        ...[
          [1, 1],
          [3, 1],
          [4, 2],
          [5, 0],
        ].map(([day, sales]) => ({
          name: "CRIMINALISTICA",
          country: "PE",
          day: "2026-10-" + String(day).padStart(2, "0"),
          sales,
          administrator: "Admin",
        })),
        {
          name: "Otro histórico",
          country: "PE",
          day: "2026-10-01",
          sales: 2,
          administrator: "Admin",
        },
      ],
      advisors: [
        [1, 3],
        [3, 1],
        [4, 2],
        [5, 0],
      ].map(([day, sales]) => ({
        name: "Asesor QA",
        country: "PE",
        day: "2026-10-" + String(day).padStart(2, "0"),
        sales,
      })),
      totals: [
        [1, 3],
        [3, 1],
        [4, 2],
        [5, 0],
      ].map(([day, sales]) => ({
        country: "PE",
        day: "2026-10-" + String(day).padStart(2, "0"),
        sales,
      })),
      manual: [13, 14].flatMap((day) => [
        {
          country: "PE",
          day: "2026-10-" + day,
          metric: "baseManual" as const,
          value: 100,
          currency: "PEN",
        },
        {
          country: "PE",
          day: "2026-10-" + day,
          metric: "totalSpend" as const,
          value: 20,
          currency: "PEN",
        },
      ]),
    },
    choices = {
      inventoryListId: lists[0].id,
      advisorListId: lists[1].id,
      totalsListId: lists[2].id,
      tables: [{ country: "PE", tableId: table.id }],
      aliases: { "PE|criminalistica": a.id },
    };
  const original = globalThis.fetch;
  globalThis.fetch = async () => {
    throw Error("No provider traffic");
  };
  let review: any, repair: any, first: any;
  try {
    await t.test(
      "La carga normal es idempotente y no repara silenciosamente",
      async () => {
        const p = await previewHistoryImport(u, { file, choices });
        first = await commitHistoryImport(u, { file, choices, token: p.token });
        const row = await db.metaEffectivenessRow.findFirstOrThrow({
            where: { aliasId: a.id, country: "PE" },
          }),
          person = await db.metaAdvisor.findFirstOrThrow({
            where: { sheetId: lists[1].id },
          });
        await db.metaEffectivenessDay.delete({
          where: { rowId_day: { rowId: row.id, day: "2026-10-03" } },
        });
        await db.metaAdvisorSalesApproval.delete({
          where: { rowId_day: { rowId: row.id, day: "2026-10-03" } },
        });
        await db.metaEffectivenessDay.update({
          where: { rowId_day: { rowId: row.id, day: "2026-10-01" } },
          data: { sales: 9 },
        });
        await db.metaAdvisorSalesApproval.update({
          where: { rowId_day: { rowId: row.id, day: "2026-10-01" } },
          data: {
            salesTotal: 9,
            allocations: [{ advisorId: person.id, sales: 9 }],
          },
        });
        await db.metaEffectivenessDay.update({
          where: { rowId_day: { rowId: row.id, day: "2026-10-04" } },
          data: { sales: null, annotations: { sales: { value: "NA" } } },
        });
        await db.metaEffectivenessRow.update({
          where: { id: row.id },
          data: { hidden: true },
        });
        await db.metaEffectivenessRow.deleteMany({
          where: { alias: { tableId: table.id }, aliasId: { not: a.id } },
        });
        await db.metaHistoricalAdvisorSale.deleteMany({
          where: { advisorId: person.id, day: "2026-10-03" },
        });
        await db.metaManualBaseDay.delete({
          where: {
            tableId_country_day: {
              tableId: table.id,
              country: "PE",
              day: "2026-10-13",
            },
          },
        });
        await db.metaManualBaseDay.update({
          where: {
            tableId_country_day: {
              tableId: table.id,
              country: "PE",
              day: "2026-10-14",
            },
          },
          data: { state: "NA", allocations: [] },
        });
        for (const d of ["2026-10-03", "2026-10-13", "2026-10-14"]) {
          const v = await db.metaEffectivenessTotalDay.findFirstOrThrow({
              where: { sheetId: lists[2].id, tableId: table.id, day: d },
            }),
            values = { ...(v.values as any) };
          if (d.endsWith("03")) {
            delete values.historicalSales;
            delete values.historicalSalesImport;
          }
          if (d.endsWith("13")) delete values.totalSpend;
          if (d.endsWith("14")) values.totalSpend = 0;
          await db.metaEffectivenessTotalDay.update({
            where: {
              sheetId_tableId_country_currency_day: {
                sheetId: v.sheetId,
                tableId: v.tableId,
                country: v.country,
                currency: v.currency,
                day: v.day,
              },
            },
            data: { values },
          });
        }
        await db.metaEffectivenessSheet.update({
          where: { id: lists[0].id },
          data: {
            config: { inventoryActivation: { detachedAliases: [a.id] } },
          },
        });
        const repeat = await previewHistoryImport(u, { file, choices });
        assert.equal(repeat.previous?.id, first.id);
        assert.equal(
          await db.metaEffectivenessDay.count({
            where: { rowId: row.id, day: "2026-10-03" },
          }),
          0,
        );
      },
    );
    await t.test(
      "Vista previa de recuperación solo lee y cuenta lo ausente",
      async () => {
        const before = await db.metaFinancialHistoryImport.count({
          where: { actorId: u.id },
        });
        review = await previewHistoryImport(u, {
          file,
          choices,
          repairMissing: true,
        });
        assert.equal(review.previous, null);
        assert.equal(review.summary.recovery?.diplomaCells, 2);
        assert.equal(review.summary.recovery?.advisorCells, 1);
        assert.equal(review.summary.recovery?.countryCells, 1);
        assert.equal(review.summary.recovery?.manualCells, 2);
        assert.equal(review.summary.restoredRows, 1);
        assert(review.summary.conflicts.some((c: any) => c.blocked));
        assert.equal(
          await db.metaFinancialHistoryImport.count({
            where: { actorId: u.id },
          }),
          before,
        );
      },
    );
    await t.test(
      "Recuperar rellena ausentes y muestra retirados sin reemplazar cero, N.A. ni ventas nominales",
      async () => {
        repair = await commitHistoryImport(u, {
          file,
          choices,
          repairMissing: true,
          token: review.token,
        });
        assert.notEqual(repair.id, first.id);
        const row = await db.metaEffectivenessRow.findFirstOrThrow({
          where: { aliasId: a.id, country: "PE" },
          include: { days: true },
        });
        assert(!row.hidden);
        const membership = await db.metaEffectivenessSheet.findUniqueOrThrow({
          where: { id: lists[0].id },
        });
        assert(
          !(
            membership.config as any
          ).inventoryActivation.detachedAliases.includes(a.id),
        );
        assert.equal(row.days.find((d) => d.day === "2026-10-01")?.sales, 9);
        assert.equal(row.days.find((d) => d.day === "2026-10-03")?.sales, 1);
        assert.equal(
          (row.days.find((d) => d.day === "2026-10-04")?.annotations as any)
            .sales.value,
          "NA",
        );
        assert.equal(row.days.find((d) => d.day === "2026-10-05")?.sales, 0);
        assert.equal(
          (
            await db.metaAdvisorSalesApproval.findUniqueOrThrow({
              where: { rowId_day: { rowId: row.id, day: "2026-10-01" } },
            })
          ).salesTotal,
          9,
        );
        assert.equal(
          (
            await db.metaManualBaseDay.findUniqueOrThrow({
              where: {
                tableId_country_day: {
                  tableId: table.id,
                  country: "PE",
                  day: "2026-10-14",
                },
              },
            })
          ).state,
          "NA",
        );
        const gm = await db.metaEffectivenessTotalDay.findFirstOrThrow({
          where: { sheetId: lists[2].id, day: "2026-10-14" },
        });
        assert.equal((gm.values as Record<string, unknown>).totalSpend, 0);
        assert.equal(
          (
            await db.metaEffectivenessState.findUniqueOrThrow({
              where: { aliasId_country: { aliasId: a.id, country: "PE" } },
            })
          ).active,
          false,
        );
        const view = await effectiveness(
          u,
          table.id,
          "2026-10-01",
          "2026-10-30",
        );
        assert(view.rows.some((r) => r.aliasId === a.id));
        assert.equal(view.rows.length, 2);
      },
    );
    await t.test(
      "Reintento conserva recibo y una recuperación posterior vuelve a comprobar la base",
      async () => {
        const retry = await commitHistoryImport(u, {
          file,
          choices,
          repairMissing: true,
          token: review.token,
        });
        assert.equal(retry.id, repair.id);
        const p = await previewHistoryImport(u, {
          file,
          choices,
          repairMissing: true,
        });
        assert.equal(p.summary.recovery?.diplomaCells, 0);
        assert.equal(p.summary.recovery?.advisorCells, 0);
        assert.equal(p.summary.recovery?.countryCells, 0);
        assert.equal(p.summary.recovery?.manualCells, 0);
        assert.equal(p.summary.restoredRows, 0);
      },
    );
    await t.test(
      "Sin permiso o con cambios posteriores a la revisión no escribe",
      async () => {
        await assert.rejects(
          () =>
            previewHistoryImport(
              { ...u, role: "ADMIN" },
              { file, choices, repairMissing: true },
            ),
          /OWNER/,
        );
        await db.metaEffectivenessRow.updateMany({
          where: { aliasId: a.id },
          data: { revision: { increment: 1 } },
        });
        const p = await previewHistoryImport(u, {
          file,
          choices,
          repairMissing: true,
        });
        await db.metaEffectivenessRow.updateMany({
          where: { aliasId: a.id },
          data: { revision: { increment: 1 } },
        });
        await assert.rejects(
          () =>
            commitHistoryImport(u, {
              file,
              choices,
              repairMissing: true,
              token: p.token,
            }),
          /cambiaron/,
        );
      },
    );
    await t.test(
      "Argentina ignora Perú/Angola solo configurados y preserva países con filas",
      async () => {
        const ar = await db.metaAliasTable.create({
          data: { name: "ARGENTINA", defaultCountry: "PE" },
        });
        try {
          const list = await db.metaEffectivenessSheet.findUniqueOrThrow({
              where: { id: lists[0].id },
            }),
            config = list.config as any;
          await db.metaEffectivenessSheet.update({
            where: { id: list.id },
            data: {
              config: {
                ...config,
                inventoryActivation: {
                  ...config.inventoryActivation,
                  sheets: [ar.id],
                  countries: { [ar.id]: ["PE", "AO"] },
                },
              },
            },
          });
          let directory = await inventoryActivationDirectory(u, {
            listId: list.id,
          });
          assert.deepEqual(
            directory.columns
              .filter((c) => c.tableId === ar.id)
              .map((c) => c.country),
            ["AR"],
          );
          await assert.rejects(
            () =>
              inventoryActivationAddSheet(u, {
                listId: list.id,
                tableId: ar.id,
                country: "PE",
              }),
            /nombre de un país/,
          );
          const foreign = await db.metaAlias.create({
            data: {
              name: "Asignado " + tag,
              tableId: ar.id,
              inventorySheetId: list.id,
            },
          });
          await db.metaEffectivenessRow.create({
            data: {
              aliasId: foreign.id,
              country: "PE",
              currency: "",
              days: {
                create: { day: "2026-10-01", sales: 0, salesOverridden: true },
              },
            },
          });
          directory = await inventoryActivationDirectory(u, {
            listId: list.id,
          });
          assert.deepEqual(
            directory.columns
              .filter((c) => c.tableId === ar.id)
              .map((c) => c.country),
            ["AR", "PE"],
          );
        } finally {
          await db.metaEffectivenessRow.deleteMany({
            where: { alias: { tableId: ar.id } },
          });
          await db.metaAlias.deleteMany({ where: { tableId: ar.id } });
          await db.metaAliasTable.delete({ where: { id: ar.id } });
        }
      },
    );
  } finally {
    globalThis.fetch = original;
    await db.metaHistoricalAdvisorSale.deleteMany({
      where: { advisor: { sheetId: lists[1].id } },
    });
    await db.metaFinancialHistoryImport.deleteMany({
      where: { actorId: u.id },
    });
    await db.metaEffectivenessTotalDay.deleteMany({
      where: { sheetId: lists[2].id },
    });
    await db.metaManualBaseDay.deleteMany({ where: { tableId: table.id } });
    await db.metaEffectivenessRow.deleteMany({
      where: { alias: { tableId: table.id } },
    });
    await db.metaEffectivenessState.deleteMany({
      where: { alias: { tableId: table.id } },
    });
    await db.metaAlias.deleteMany({ where: { tableId: table.id } });
    await db.metaInventoryItem.deleteMany({ where: { sheetId: lists[0].id } });
    await db.metaAdvisor.deleteMany({ where: { sheetId: lists[1].id } });
    await db.metaAliasTable.delete({ where: { id: table.id } });
    await db.metaEffectivenessSheet.deleteMany({
      where: { id: { in: lists.map((l) => l.id) } },
    });
    await db.auditEvent.deleteMany({ where: { actorId: u.id } });
    await db.user.delete({ where: { id: u.id } });
    await db.$disconnect();
  }
});
