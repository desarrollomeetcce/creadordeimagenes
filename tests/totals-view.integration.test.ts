import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../lib/db";
import { effectivenessTotals } from "../lib/meta-ads/effectiveness-totals";
import { totalSourceBlocks } from "../lib/meta-ads/total-source-blocks";
import { encryptKey } from "../lib/crypto";
test("Totales: bloques vacíos sin perder B/BM, ceros o N.A. ni cambiar los datos", async (t) => {
  assert(
    process.env.DATABASE_URL?.includes("library_organization_test") &&
      process.env.DATABASE_URL.includes("/workspace/work/pgdata"),
  );
  const tag = randomUUID(),
    u = await db.user.create({
      data: {
        name: "QA Totales",
        email: "totals-view-" + tag + "@example.test",
        role: "OWNER",
        status: "APPROVED",
        passwordHash: "synthetic",
      },
    }),
    lists = await Promise.all(
      ["INVENTORY", "TOTALS"].map((kind) =>
        db.metaEffectivenessSheet.create({
          data: { kind, name: "QA totales " + kind + " " + tag },
        }),
      ),
    ),
    tables = await Promise.all(
      ["AR", "GT"].map((country) =>
        db.metaAliasTable.create({
          data: {
            name: "QA " + country + " " + tag,
            defaultCountry: country,
            defaultCurrency: "PEN",
          },
        }),
      ),
    ),
    ids = tables.map((t) => t.id),
    aliases = await Promise.all(
      tables.map((t) =>
        db.metaAlias.create({
          data: {
            tableId: t.id,
            inventorySheetId: lists[0].id,
            name: "QA curso " + tag,
          },
        }),
      ),
    ),
    rows = await Promise.all(
      aliases.map((a) =>
        db.metaEffectivenessRow.create({
          data: {
            aliasId: a.id,
            country: "",
            currency: "",
            displayCurrency: "PEN",
          },
        }),
      ),
    ),
    connection = await db.metaConnection.create({
      data: {
        ownerId: u.id,
        name: "QA totales " + tag,
        transport: "API",
        encryptedToken: encryptKey("synthetic-totals-token", "meta:pending"),
      },
    }),
    accountId = String(Date.now()) + "91",
    objectId = accountId + "1";
  const original = globalThis.fetch;
  globalThis.fetch = async () => {
    throw Error("No real provider calls");
  };
  try {
    await db.metaAdAccount.create({
      data: {
        id: accountId,
        connectionId: connection.id,
        name: "QA",
        currency: "PEN",
        timezone: "America/Lima",
      },
    });
    await db.metaAdObject.create({
      data: {
        id: objectId,
        accountId,
        level: "campaign",
        name: "QA",
        aliasId: aliases[0].id,
        aliasCountry: "AR",
        status: "ACTIVE",
      },
    });
    await db.metaAdDaily.create({
      data: {
        objectId,
        accountId,
        day: "2026-10-20",
        scope: "7d_click,1d_view|impression",
        spend: 15,
        actions: { "onsite_conversion.messaging_conversation_started_7d": 10 },
      },
    });
    for (let i = 0; i < 2; i++) {
      await db.metaEffectivenessRow.create({
        data: {
          aliasId: aliases[i].id,
          country: tables[i].defaultCountry,
          currency: "",
          displayCurrency: "PEN",
          days: {
            create: { day: "2026-10-20", sales: 0, salesOverridden: true },
          },
        },
      });
      await db.metaManualBaseDay.create({
        data: {
          tableId: tables[i].id,
          country: tables[i].defaultCountry,
          day: "2026-10-20",
          state: "VALUE",
          allocations: [{ advisorId: null, quantity: 100 + i * 100 }],
        },
      });
    }
    await t.test(
      "Argentina y Guatemala muestran un bloque con datos; no se elimina la fila original",
      async () => {
        for (const table of tables) {
          const data = await effectivenessTotals(
            u,
            table.id,
            "2026-10-01",
            "2026-11-02",
            lists[1].id,
          );
          assert.equal(data.groups.length, 2);
          const blocks = totalSourceBlocks([data]);
          assert.equal(blocks.length, 1);
          assert.equal(blocks[0].country, table.defaultCountry);
        }
        assert.equal(
          await db.metaEffectivenessRow.count({
            where: { id: { in: rows.map((r) => r.id) } },
          }),
          2,
        );
      },
    );
    await t.test(
      "B Meta y BM son distintos; vacíos de BM no se inventan ni se desplazan",
      async () => {
        const data = await effectivenessTotals(
            u,
            tables[0].id,
            "2026-10-01",
            "2026-11-02",
            lists[1].id,
          ),
          g = data.groups.find((g) => g.country === "AR")!;
        assert.equal(g.days["2026-10-20"].sums.base.value, 10);
        assert.equal(g.days["2026-10-20"].manual.baseManual, 100);
        assert.equal(g.days["2026-10-19"].manual.baseManual, undefined);
        assert.equal(g.days["2026-10-31"].manual.baseManual, undefined);
        assert.equal(g.days["2026-10-20"].sums.spend.value, 15);
        assert.equal(g.days["2026-10-20"].sums.sales.value, 0);
      },
    );
    await t.test("CAC original de Meta permanece separado de ajustes manuales de gasto", async () => {
      const row = await db.metaEffectivenessRow.findFirstOrThrow({where:{aliasId:aliases[0].id,country:"AR"}});
      const cell = await db.metaEffectivenessDay.findUniqueOrThrow({where:{rowId_day:{rowId:row.id,day:"2026-10-20"}}});
      try {
        await db.metaEffectivenessDay.update({where:{rowId_day:{rowId:cell.rowId,day:cell.day}},data:{annotations:{spend:{value:999,currency:"PEN"}}}});
        const data = await effectivenessTotals(u,tables[0].id,"2026-10-20","2026-10-20",lists[1].id);
        const day = data.groups.find(g=>g.country==="AR")!.days["2026-10-20"];
        assert.equal(day.sums.spend.value,999);
        assert.equal(day.metaSums.spend.value,15);
        assert.equal(day.metaSums.base.value,10);
      } finally {await db.metaEffectivenessDay.update({where:{rowId_day:{rowId:cell.rowId,day:cell.day}},data:{annotations:cell.annotations as any}});}
    });
    await t.test(
      "Una fecha sin datos conserva solo el país conocido; Sin país explícito sigue consultable",
      async () => {
        const data = await effectivenessTotals(
          u,
          tables[0].id,
          "2026-11-01",
          "2026-11-02",
          lists[1].id,
        );
        assert.equal(totalSourceBlocks([data]).length, 1);
        assert.equal(totalSourceBlocks([data])[0].country, "AR");
        assert.equal(totalSourceBlocks([data], "__none")[0].country, "");
      },
    );
    await t.test(
      "Datos reales en bloque sin país, incluido cero y N.A., se conservan",
      async () => {
        await db.metaEffectivenessDay.create({
          data: {
            rowId: rows[0].id,
            day: "2026-10-21",
            sales: 0,
            salesOverridden: true,
          },
        });
        let data = await effectivenessTotals(
          u,
          tables[0].id,
          "2026-10-01",
          "2026-11-02",
          lists[1].id,
        );
        assert.equal(totalSourceBlocks([data]).length, 2);
        await db.metaEffectivenessDay.delete({
          where: { rowId_day: { rowId: rows[0].id, day: "2026-10-21" } },
        });
        await db.metaEffectivenessDay.create({
          data: {
            rowId: rows[0].id,
            day: "2026-10-22",
            annotations: { sales: { value: "NA" } },
          },
        });
        data = await effectivenessTotals(
          u,
          tables[0].id,
          "2026-10-01",
          "2026-11-02",
          lists[1].id,
        );
        assert.equal(totalSourceBlocks([data]).length, 2);
      },
    );
    await t.test(
      "Inactivar hoy conserva ventas y base del período histórico",
      async () => {
        await db.metaEffectivenessState.create({
          data: { aliasId: aliases[0].id, country: "AR", active: false },
        });
        try {
          const data = await effectivenessTotals(
            u,
            tables[0].id,
            "2026-10-01",
            "2026-11-02",
            lists[1].id,
          );
          const g = data.groups.find((g) => g.country === "AR")!;
          assert.equal(g.days["2026-10-20"].sums.sales.value, 0);
          assert.equal(g.days["2026-10-20"].sums.base.value, 10);
          assert.equal(g.days["2026-10-20"].manual.baseManual, 100);
          assert.equal(
            totalSourceBlocks([data]).filter((b) => b.country === "AR").length,
            1,
          );
          assert.equal(
            (
              await db.metaEffectivenessState.findUniqueOrThrow({
                where: {
                  aliasId_country: { aliasId: aliases[0].id, country: "AR" },
                },
              })
            ).active,
            false,
          );
        } finally {
          await db.metaEffectivenessState.deleteMany({
            where: { aliasId: aliases[0].id },
          });
        }
      },
    );
  } finally {
    globalThis.fetch = original;
    await db.metaAdAccount.deleteMany({ where: { id: accountId } });
    await db.metaConnection.delete({ where: { id: connection.id } });
    await db.metaManualBaseDay.deleteMany({ where: { tableId: { in: ids } } });
    await db.metaEffectivenessTotalDay.deleteMany({
      where: { sheetId: lists[1].id },
    });
    await db.metaEffectivenessRow.deleteMany({
      where: { alias: { tableId: { in: ids } } },
    });
    await db.metaAlias.deleteMany({ where: { tableId: { in: ids } } });
    await db.metaAliasTable.deleteMany({ where: { id: { in: ids } } });
    await db.metaEffectivenessSheet.deleteMany({
      where: { id: { in: lists.map((l) => l.id) } },
    });
    await db.user.delete({ where: { id: u.id } });
    await db.$disconnect();
  }
});
