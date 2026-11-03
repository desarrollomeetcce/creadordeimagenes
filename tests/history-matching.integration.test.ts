import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../lib/db";
import {
  historyImportOptions,
  previewHistoryImport,
  commitHistoryImport,
  type HistoryFile,
} from "../lib/meta-ads/financial-history-import";
import {
  prepareHistoryChoices,
  type HistoryOptions,
} from "../lib/meta-ads/history-matching";
test("Histórico: reconocer catálogo/personas y crear país sin duplicar diplomados ni recibos", async (t) => {
  assert(
    process.env.DATABASE_URL?.includes("library_organization_test") &&
      process.env.DATABASE_URL.includes("/workspace/work/pgdata"),
  );
  const tag = randomUUID(),
    u = await db.user.create({
      data: {
        name: "QA equivalencias",
        email: "matching-" + tag + "@example.test",
        role: "OWNER",
        status: "APPROVED",
        passwordHash: "synthetic",
      },
    }),
    lists = await Promise.all(
      ["INVENTORY", "ADVISORS", "TOTALS", "INVENTORY"].map((kind, i) =>
        db.metaEffectivenessSheet.create({
          data: { name: "QA equivalencias " + i + " " + tag, kind },
        }),
      ),
    ),
    table = await db.metaAliasTable.create({
      data: {
        name: "QA matching " + tag,
        defaultCountry: "PE",
        defaultCurrency: "PEN",
      },
    }),
    tables = [table.id];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw Error("No provider traffic");
  };
  try {
    const steel = await db.metaInventoryItem.create({
        data: {
          sheetId: lists[0].id,
          name: "Diseño para construcción en acero",
        },
      }),
      math = await db.metaAlias.create({
        data: {
          tableId: table.id,
          inventorySheetId: lists[0].id,
          name: "Didáctica de la matemática",
        },
      }),
      greg = await db.metaAdvisor.create({
        data: { sheetId: lists[1].id, name: "Gregory" },
      }),
      foreign = await db.metaInventoryItem.create({
        data: { sheetId: lists[3].id, name: "Ficha ajena" },
      });
    await db.metaEffectivenessRow.create({
      data: {
        aliasId: math.id,
        country: "PE",
        currency: "",
        displayCurrency: "PEN",
      },
    });
    const file: HistoryFile = {
      version: 1,
      source: {
        url: "https://example.test/source",
        title: "Sintético " + tag,
        salesSince: "2026-10-01",
        salesUntil: "2026-10-30",
        marketingSince: "2026-10-13",
        marketingUntil: "2026-10-31",
        notes: [],
      },
      diplomas: [
        {
          name: "ACERO",
          country: "SV",
          day: "2026-10-01",
          sales: 2,
          administrator: "Admin",
        },
        {
          name: "CONSTRUCCION ACERO",
          country: "SV",
          day: "2026-10-01",
          sales: 4,
          administrator: "Admin",
        },
        {
          name: "MATEMATICAS",
          country: "PE",
          day: "2026-10-01",
          sales: 3,
          administrator: "Admin",
        },
      ],
      advisors: [
        { name: "GREGORI", country: "PE", day: "2026-10-01", sales: 1 },
        { name: "GREGORICK", country: "PE", day: "2026-10-01", sales: 2 },
      ],
      totals: [
        { country: "PE", day: "2026-10-01", sales: 3 },
        { country: "SV", day: "2026-10-01", sales: 0 },
      ],
      manual: [],
    };
    const scoped = async () => {
      const options = await historyImportOptions(u);
      return {
        ...options,
        sheets: options.sheets.filter((s) =>
          lists.slice(0, 3).some((l) => l.id === s.id),
        ),
        tables: options.tables.filter((t) => tables.includes(t.id)),
      } as HistoryOptions;
    };
    let choices = prepareHistoryChoices(file, await scoped());
    let preview: Awaited<ReturnType<typeof previewHistoryImport>>;
    await t.test(
      "Preselección reutiliza ficha completa y Gregory; preview sin escrituras",
      async () => {
        assert.equal(choices.aliases["PE|matematicas"], math.id);
        assert.equal(choices.catalog["SV|acero"], "item:" + steel.id);
        assert.equal(choices.people.gregori, greg.id);
        assert.equal(choices.people.gregorick, greg.id);
        preview = await previewHistoryImport(u, { file, choices });
        assert.equal(preview.summary.newDiplomas.length, 1);
        assert.equal(preview.summary.newDiplomas[0].name, steel.name);
        assert.equal(preview.summary.newAdvisors.length, 0);
        assert.equal(
          await db.metaFinancialHistoryImport.count({
            where: { actorId: u.id },
          }),
          0,
        );
      },
    );
    await t.test(
      "Ficha ajena y contexto de catálogo modificado se rechazan antes de guardar",
      async () => {
        await assert.rejects(
          previewHistoryImport(u, {
            file,
            choices: {
              ...choices,
              catalog: { ...choices.catalog, "SV|acero": "item:" + foreign.id },
            },
          }),
          /inventario/,
        );
        await db.metaInventoryItem.update({
          where: { id: steel.id },
          data: { name: "Otro nombre temporal" },
        });
        await assert.rejects(
          commitHistoryImport(u, { file, choices, token: preview.token }),
          /cambiaron/,
        );
        assert.equal(
          await db.metaFinancialHistoryImport.count({
            where: { actorId: u.id },
          }),
          0,
        );
        await db.metaInventoryItem.update({
          where: { id: steel.id },
          data: { name: steel.name },
        });
      },
    );
    await t.test(
      "Una nueva hoja y alias canónico, sin nueva ficha ni persona; reabrir conserva recibo",
      async () => {
        preview = await previewHistoryImport(u, { file, choices });
        const first = await commitHistoryImport(u, {
          file,
          choices,
          token: preview.token,
        });
        const sv = await db.metaAliasTable.findFirstOrThrow({
          where: { name: "El Salvador" },
        });
        tables.push(sv.id);
        const a = await db.metaAlias.findFirstOrThrow({
          where: { tableId: sv.id },
        });
        assert.equal(a.name, steel.name);
        assert.equal(
          await db.metaAlias.count({ where: { tableId: sv.id } }),
          1,
        );
        assert.equal(
          await db.metaInventoryItem.count({ where: { sheetId: lists[0].id } }),
          1,
        );
        assert.equal(
          await db.metaAdvisor.count({ where: { sheetId: lists[1].id } }),
          1,
        );
        const row = await db.metaEffectivenessRow.findFirstOrThrow({
          where: { aliasId: a.id, country: "SV" },
        });
        assert.equal(
          (
            await db.metaEffectivenessDay.findFirstOrThrow({
              where: { rowId: row.id },
            })
          ).sales,
          6,
        );
        assert.equal(
          (
            await db.metaHistoricalAdvisorSale.findFirstOrThrow({
              where: { advisorId: greg.id },
            })
          ).sales,
          3,
        );
        choices = prepareHistoryChoices(file, await scoped());
        assert.equal(
          choices.tables.find((t) => t.country === "SV")?.tableId,
          sv.id,
        );
        assert.equal(choices.aliases["SV|acero"], a.id);
        const repeated = await previewHistoryImport(u, { file, choices });
        assert.equal(repeated.previous?.id, first.id);
        assert.equal(
          (await commitHistoryImport(u, { file, choices, token: "old" })).id,
          first.id,
        );
        assert.equal(
          await db.metaFinancialHistoryImport.count({
            where: { actorId: u.id },
          }),
          1,
        );
      },
    );
    await t.test(
      "Una tabla de varios países reutiliza alias y conserva ambos estados inactivos",
      async () => {
        const mixed = structuredClone(file);
        mixed.source.title += " múltiple";
        mixed.diplomas = mixed.diplomas.filter((r) => r.country !== "PE");
        mixed.diplomas[0].country = "PE";
        const targets = {
          ...choices,
          tables: choices.tables.map((t) => ({ ...t, tableId: table.id })),
          aliases: {},
          catalog: {
            "PE|acero": "item:" + steel.id,
            "SV|construccion acero": "item:" + steel.id,
          },
        };
        const p = await previewHistoryImport(u, {
          file: mixed,
          choices: targets,
        });
        await commitHistoryImport(u, {
          file: mixed,
          choices: targets,
          token: p.token,
        });
        const alias = await db.metaAlias.findFirstOrThrow({
          where: { tableId: table.id, name: steel.name },
        });
        const states = await db.metaEffectivenessState.findMany({
          where: { aliasId: alias.id },
        });
        assert.deepEqual(states.map((s) => s.country).sort(), ["PE", "SV"]);
        assert(states.every((s) => !s.active));
        assert.equal(
          await db.metaAlias.count({
            where: { tableId: table.id, name: steel.name },
          }),
          1,
        );
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
    const ownedAliases = await db.metaAlias.findMany({
      where: { inventorySheetId: lists[0].id },
      select: { tableId: true },
    });
    for (const a of ownedAliases)
      if (!tables.includes(a.tableId)) tables.push(a.tableId);
    await db.metaHistoricalAdvisorSale.deleteMany({
      where: { advisor: { sheetId: lists[1].id } },
    });
    await db.metaFinancialHistoryImport.deleteMany({
      where: { actorId: u.id },
    });
    await db.metaEffectivenessTotalDay.deleteMany({
      where: { sheetId: lists[2].id },
    });
    await db.metaEffectivenessRow.deleteMany({
      where: { alias: { inventorySheetId: lists[0].id } },
    });
    await db.metaEffectivenessState.deleteMany({
      where: { alias: { inventorySheetId: lists[0].id } },
    });
    await db.metaAlias.deleteMany({ where: { inventorySheetId: lists[0].id } });
    await db.metaInventoryItem.deleteMany({
      where: { sheetId: { in: [lists[0].id, lists[3].id] } },
    });
    await db.metaAdvisor.deleteMany({ where: { sheetId: lists[1].id } });
    await db.metaAliasTable.deleteMany({ where: { id: { in: tables } } });
    await db.metaEffectivenessSheet.deleteMany({
      where: { id: { in: lists.map((l) => l.id) } },
    });
    await db.auditEvent.deleteMany({ where: { actorId: u.id } });
    await db.user.delete({ where: { id: u.id } });
    await db.$disconnect();
  }
});
