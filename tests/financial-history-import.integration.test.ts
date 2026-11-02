import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../lib/db";
import {
  previewHistoryImport,
  commitHistoryImport,
  historyImportOptions,
  type HistoryFile,
} from "../lib/meta-ads/financial-history-import";
import { categoryKey } from "../lib/meta-ads/category-paste";
import { advisorSheet } from "../lib/meta-ads/advisors";
import { advisorSalesReview } from "../lib/meta-ads/advisor-sales-approval";
import {
  effectiveness,
  changeEffectivenessIdentity,
} from "../lib/meta-ads/effectiveness";
import { effectivenessTotals } from "../lib/meta-ads/effectiveness-totals";
import {
  previewDeleteEffectivenessRows,
  deleteEffectivenessRows,
} from "../lib/meta-ads/delete-effectiveness-rows";
test("Histórico: fuentes independientes, importación OWNER revisada e idempotente, país existente y borrar sin país", async (t) => {
  assert(
    process.env.DATABASE_URL?.includes("library_organization_test") &&
      process.env.DATABASE_URL.includes("/workspace/work/pgdata"),
  );
  const tag = randomUUID(),
    u = await db.user.create({
      data: {
        name: "QA histórico",
        email: "history-" + tag + "@example.test",
        passwordHash: "synthetic",
        role: "OWNER",
        status: "APPROVED",
      },
    }),
    actor = { id: u.id, role: u.role },
    original = globalThis.fetch;
  globalThis.fetch = async () => {
    throw Error("External calls forbidden");
  };
  const inventory = await db.metaEffectivenessSheet.create({
      data: { name: "Hist inv " + tag, kind: "INVENTORY" },
    }),
    advisors = await db.metaEffectivenessSheet.create({
      data: { name: "Hist asesores " + tag, kind: "ADVISORS" },
    }),
    totals = await db.metaEffectivenessSheet.create({
      data: { name: "Hist totales " + tag, kind: "TOTALS" },
    }),
    tables = await Promise.all(
      ["PE", "EC"].map((c) =>
        db.metaAliasTable.create({
          data: { name: tag + c, defaultCountry: c, defaultCurrency: "PEN" },
        }),
      ),
    );
  const tableIds = tables.map((t) => t.id),
    name = "Diplomado " + tag;
  const file: HistoryFile = {
    version: 1,
    source: {
      url: "https://example.org/source",
      title: "Histórico QA",
      salesSince: "2026-10-01",
      salesUntil: "2026-10-30",
      marketingSince: "2026-10-13",
      marketingUntil: "2026-10-31",
      notes: ["Fuentes independientes"],
    },
    diplomas: [
      {
        name,
        country: "PE",
        day: "2026-10-01",
        sales: 6,
        administrator: "Admin A",
      },
      {
        name,
        country: "EC",
        day: "2026-10-01",
        sales: 2,
        administrator: "Admin B",
      },
    ],
    advisors: [
      { name: "Ana " + tag, country: "PE", day: "2026-10-01", sales: 4 },
      { name: "Kevin " + tag, country: "PE", day: "2026-10-01", sales: 2 },
      { name: "Ana " + tag, country: "EC", day: "2026-10-01", sales: 3 },
    ],
    totals: [
      { country: "PE", day: "2026-10-01", sales: 6 },
      { country: "EC", day: "2026-10-01", sales: 3 },
    ],
    manual: [
      {
        country: "PE",
        day: "2026-10-13",
        metric: "baseManual",
        value: 300,
        currency: "PEN",
      },
      {
        country: "PE",
        day: "2026-10-13",
        metric: "totalSpend",
        value: 25,
        currency: "PEN",
      },
    ],
  };
  const existingAna = await db.metaAdvisor.create({
    data: { sheetId: advisors.id, name: "Ana Sistema " + tag },
  });
  const choices = {
    inventoryListId: inventory.id,
    advisorListId: advisors.id,
    totalsListId: totals.id,
    tables: tables.map((t) => ({ country: t.defaultCountry, tableId: t.id })),
    aliases: {},
    people: { [categoryKey("Ana " + tag)]: existingAna.id },
  };
  let first: any;
  try {
    await t.test(
      "Revisar no escribe; valida totales y rechaza permisos/celdas repetidas",
      async () => {
        const before = await db.metaAlias.count(),
          p = await previewHistoryImport(actor, { file, choices });
        assert.equal(await db.metaAlias.count(), before);
        assert.equal(p.summary.diplomaSales, 8);
        assert.equal(p.summary.advisorSales, 9);
        assert.equal(p.summary.countrySales, 9);
        assert.equal(p.summary.newDiplomas.length, 2);
        assert.equal(p.summary.newAdvisors.length, 1);
        await assert.rejects(
          historyImportOptions({ ...actor, role: "OBSERVER" }),
        );
        await assert.rejects(
          previewHistoryImport(actor, {
            file: {
              ...file,
              totals: [{ country: "PE", day: "2026-10-01", sales: 99 }],
            },
            choices,
          }),
        );
        await assert.rejects(
          previewHistoryImport(actor, {
            file: { ...file, diplomas: [...file.diplomas, file.diplomas[0]] },
            choices,
          }),
        );
        await assert.rejects(
          previewHistoryImport(actor, {
            file: { ...file, advisors: [{ ...file.advisors[0], sales: 0.5 }] },
            choices,
          }),
        );
      },
    );
    await t.test(
      "Guardar conserva vendedor desconocido, personales separados, V total sin duplicar y BM/GM exactos",
      async () => {
        const p = await previewHistoryImport(actor, { file, choices });
        first = await commitHistoryImport(actor, {
          file,
          choices,
          token: p.token,
        });
        assert(!first.reused);
        const aliases = await db.metaAlias.findMany({
          where: { tableId: { in: tableIds } },
        });
        assert.equal(aliases.length, 2);
        assert.equal(
          await db.metaInventoryItem.count({
            where: { sheetId: inventory.id, name },
          }),
          1,
        );
        const pe = aliases.find((a) => a.tableId === tables[0].id)!;
        const sales = await advisorSalesReview(actor, {
          aliasId: pe.id,
          country: "PE",
          day: "2026-10-01",
        });
        assert.deepEqual(sales.allocations, [{ advisorId: null, sales: 6 }]);
        const personal = await advisorSheet(
          actor,
          "all",
          "2026-10-01",
          "2026-10-13",
          { advisorListId: advisors.id },
        );
        assert.equal(
          personal.rows.find((p) => p.id === existingAna.id)!.days["2026-10-01"]
            .sales,
          7,
        );
        assert.equal(
          personal.rows.find((p) => p.name === "Kevin " + tag)!.days[
            "2026-10-01"
          ].sales,
          2,
        );
        assert.equal(
          personal.rows.find((p) => p.id === existingAna.id)!.days["2026-10-01"]
            .historicalSales,
          true,
        );
        const subset = await advisorSheet(
          actor,
          tables[0].id,
          "2026-10-01",
          "2026-10-01",
          { advisorListId: advisors.id },
        );
        assert(
          !subset.rows.find((p) => p.id === existingAna.id)!.days["2026-10-01"]
            .historicalSales,
        );
        const overall = await effectivenessTotals(
          actor,
          tables[1].id,
          "2026-10-01",
          "2026-10-13",
          totals.id,
        );
        assert.equal(
          overall.groups.find((g) => g.country === "EC")!.days["2026-10-01"]
            .sums.sales.value,
          3,
        );
        const peTotal = await effectivenessTotals(
          actor,
          tables[0].id,
          "2026-10-01",
          "2026-10-13",
          totals.id,
        );
        assert.equal(
          peTotal.groups.find((g) => g.country === "PE")!.days["2026-10-13"]
            .manual.baseManual,
          300,
        );
        assert.equal(
          peTotal.groups.find((g) => g.country === "PE")!.days["2026-10-13"]
            .manual.totalSpend,
          25,
        );
        const source = await effectiveness(
          actor,
          tables[0].id,
          "2026-10-13",
          "2026-10-13",
        );
        assert.equal(
          source.rows.find((r) => r.aliasId === pe.id)!.days["2026-10-13"]
            ?.metaSpend ?? null,
          null,
        );
      },
    );
    await t.test(
      "Equivalencias consolidan dos nombres de diplomado en una sola celda de destino",
      async () => {
        const alias = await db.metaAlias.findFirstOrThrow({
          where: { tableId: tables[0].id },
        });
        const merged = structuredClone(file);
        merged.source.title = "Equivalencias QA";
        merged.diplomas = [
          { ...file.diplomas[0], sales: 4 },
          { ...file.diplomas[0], name: "Abreviatura " + tag, sales: 2 },
          file.diplomas[1],
        ];
        const target = {
          ...choices,
          aliases: { ["PE|" + categoryKey("Abreviatura " + tag)]: alias.id },
        };
        const p = await previewHistoryImport(actor, {
          file: merged,
          choices: target,
        });
        assert.equal(p.summary.sourceDiplomaDays, 3);
        assert.equal(p.summary.diplomaDays, 2);
        assert.equal(p.summary.conflicts.length, 0);
        await commitHistoryImport(actor, {
          file: merged,
          choices: target,
          token: p.token,
        });
        const row = await db.metaEffectivenessRow.findFirstOrThrow({
          where: { aliasId: alias.id, country: "PE", currency: "" },
        });
        assert.equal(
          (
            await db.metaEffectivenessDay.findUniqueOrThrow({
              where: { rowId_day: { rowId: row.id, day: "2026-10-01" } },
            })
          ).sales,
          6,
        );
      },
    );
    await t.test(
      "Repetir devuelve recibo; cambios concurrentes y conflicto requieren revisión nueva",
      async () => {
        const again = await commitHistoryImport(actor, {
          file,
          choices,
          token: "old",
        });
        assert.equal(again.id, first.id);
        assert(again.reused);
        const changed = structuredClone(file);
        changed.diplomas[0].sales = 7;
        let p = await previewHistoryImport(actor, { file: changed, choices });
        assert.equal(p.summary.conflicts.length, 1);
        const alias = await db.metaAlias.findFirstOrThrow({
            where: { tableId: tables[0].id },
          }),
          row = await db.metaEffectivenessRow.findFirstOrThrow({
            where: { aliasId: alias.id, country: "PE", currency: "" },
          });
        await db.metaEffectivenessDay.update({
          where: { rowId_day: { rowId: row.id, day: "2026-10-01" } },
          data: { revision: { increment: 1 } },
        });
        await assert.rejects(
          commitHistoryImport(actor, {
            file: changed,
            choices,
            token: p.token,
            replaceConflicts: true,
          }),
          /cambiaron/,
        );
        p = await previewHistoryImport(actor, { file: changed, choices });
        await assert.rejects(
          commitHistoryImport(actor, {
            file: changed,
            choices,
            token: p.token,
          }),
          /conflicto/,
        );
        await commitHistoryImport(actor, {
          file: changed,
          choices,
          token: p.token,
          replaceConflicts: true,
        });
        assert.equal(
          (
            await db.metaEffectivenessDay.findUniqueOrThrow({
              where: { rowId_day: { rowId: row.id, day: "2026-10-01" } },
            })
          ).sales,
          7,
        );
        assert(
          (await db.metaFinancialHistoryImport.count({
            where: { actorId: u.id },
          })) === 3,
        );
      },
    );
    await t.test(
      "Elegir país reutiliza destino con historia/datos sin mezclarlo con un origen vacío",
      async () => {
        const alias = await db.metaAlias.findFirstOrThrow({
            where: { tableId: tables[0].id },
          }),
          target = await db.metaEffectivenessRow.findFirstOrThrow({
            where: { aliasId: alias.id, country: "PE", currency: "" },
          }),
          person = await db.metaAdvisor.findFirstOrThrow({
            where: { sheetId: advisors.id },
          });
        await db.metaEffectivenessRow.update({
          where: { id: target.id },
          data: { hidden: true, advisorId: person.id },
        });
        await db.metaAdvisorAssignment.create({
          data: {
            aliasId: alias.id,
            country: "PE",
            advisorId: person.id,
            effectiveAt: new Date("2026-10-01T05:00:00Z"),
            mode: "DAY",
          },
        });
        const blank = await db.metaEffectivenessRow.create({
          data: {
            aliasId: alias.id,
            country: "",
            currency: "",
            displayCurrency: "PEN",
          },
        });
        await changeEffectivenessIdentity(actor, {
          aliasId: alias.id,
          fromCountry: "",
          fromCurrency: "PEN",
          country: "PE",
          currency: "PEN",
          revision: blank.revision,
        });
        assert(
          (
            await db.metaEffectivenessRow.findUniqueOrThrow({
              where: { id: blank.id },
            })
          ).hidden,
        );
        const current = await db.metaEffectivenessRow.findUniqueOrThrow({
          where: { id: target.id },
        });
        assert(!current.hidden);
        assert.equal(current.advisorId, person.id);
        assert.equal(
          (
            await db.metaEffectivenessDay.findUniqueOrThrow({
              where: { rowId_day: { rowId: target.id, day: "2026-10-01" } },
            })
          ).sales,
          7,
        );
        assert.equal(
          await db.metaAdvisorAssignment.count({
            where: { aliasId: alias.id, country: "PE" },
          }),
          1,
        );
      },
    );
    await t.test(
      "Retirar Periodismo sin país no crea un estado inválido ni borra catálogo/historia",
      async () => {
        const a = await db.metaAlias.create({
          data: {
            tableId: tables[0].id,
            inventorySheetId: inventory.id,
            name: "Periodismo " + tag,
          },
        });
        await db.metaEffectivenessRow.create({
          data: {
            aliasId: a.id,
            country: "",
            currency: "",
            displayCurrency: "PEN",
          },
        });
        const selection = {
            tableId: tables[0].id,
            since: "2026-10-01",
            until: "2026-10-02",
            targets: [{ aliasId: a.id, country: "" }],
          },
          preview = await previewDeleteEffectivenessRows(actor, selection);
        await deleteEffectivenessRows(actor, {
          ...selection,
          token: preview.token,
        });
        assert(
          (
            await db.metaEffectivenessRow.findFirstOrThrow({
              where: { aliasId: a.id, country: "" },
            })
          ).hidden,
        );
        assert.equal(
          await db.metaEffectivenessState.count({
            where: { aliasId: a.id, country: "" },
          }),
          0,
        );
        assert(
          await db.metaInventoryItem.findFirst({
            where: { sheetId: inventory.id, name: a.name },
          }),
        );
      },
    );
  } finally {
    globalThis.fetch = original;
    await db.metaHistoricalAdvisorSale.deleteMany({
      where: { advisor: { sheetId: advisors.id } },
    });
    await db.metaFinancialHistoryImport.deleteMany({
      where: { actorId: u.id },
    });
    await db.metaEffectivenessTotalDay.deleteMany({
      where: { sheetId: totals.id },
    });
    await db.metaManualBaseDay.deleteMany({
      where: { tableId: { in: tableIds } },
    });
    await db.metaAdvisorAssignment.deleteMany({
      where: { alias: { tableId: { in: tableIds } } },
    });
    await db.metaEffectivenessRow.deleteMany({
      where: { alias: { tableId: { in: tableIds } } },
    });
    await db.metaEffectivenessEvent.deleteMany({
      where: { state: { alias: { tableId: { in: tableIds } } } },
    });
    await db.metaEffectivenessState.deleteMany({
      where: { alias: { tableId: { in: tableIds } } },
    });
    await db.metaAlias.deleteMany({ where: { tableId: { in: tableIds } } });
    await db.metaInventoryItem.deleteMany({ where: { sheetId: inventory.id } });
    await db.metaAdvisor.deleteMany({ where: { sheetId: advisors.id } });
    await db.metaAliasTable.deleteMany({ where: { id: { in: tableIds } } });
    await db.metaEffectivenessSheet.deleteMany({
      where: { id: { in: [inventory.id, advisors.id, totals.id] } },
    });
    await db.auditEvent.deleteMany({ where: { actorId: u.id } });
    await db.user.delete({ where: { id: u.id } });
    await db.$disconnect();
  }
});
