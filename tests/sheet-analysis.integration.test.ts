import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../lib/db";
import {
  sheetAnalysis,
  sheetActivityStart,
} from "../lib/meta-ads/sheet-analysis";
import { effectivenessDetail } from "../lib/meta-ads/effectiveness-detail";
import { authorizeFinancialRequest } from "../lib/meta-ads/financial-access";
import { limaDay } from "../lib/meta-ads/advisor-attribution";
import { inventoryActivationReport } from "../lib/meta-ads/inventory-sheet-activation";
test("financial historical report backfill, zero without P, bases counted once, original Meta and scoped VIEW", async () => {
  assert(
    process.env.DATABASE_URL?.includes("library_organization_test") &&
      process.env.DATABASE_URL.includes("/workspace/work/pgdata"),
  );
  const tag = randomUUID(),
    today = limaDay(new Date()),
    prior = new Date(Date.parse(today) - 86400000).toISOString().slice(0, 10),
    old = new Date(Date.parse(today) - 2 * 86400000).toISOString().slice(0, 10);
  const owner = await db.user.create({
    data: {
      name: "QA report",
      email: tag + "@example.test",
      passwordHash: "synthetic",
      role: "OWNER",
      status: "APPROVED",
    },
  });
  const viewer = await db.user.create({
    data: {
      name: "QA VIEW",
      email: "v" + tag + "@example.test",
      passwordHash: "synthetic",
      role: "OBSERVER",
      status: "APPROVED",
    },
  });
  const list = await db.metaEffectivenessSheet.create({
      data: { kind: "INVENTORY", name: tag },
    }),
    table = await db.metaAliasTable.create({
      data: { name: tag, defaultCountry: "PE", defaultCurrency: "PEN" },
    }),
    other = await db.metaAliasTable.create({ data: { name: "other" + tag } });
  const alias = await db.metaAlias.create({
    data: {
      tableId: table.id,
      inventorySheetId: list.id,
      name: "Diplomado " + tag,
    },
  });
  const row = await db.metaEffectivenessRow.create({
    data: {
      aliasId: alias.id,
      country: "PE",
      currency: "",
      displayCurrency: "PEN",
      days: {
        create: [
          { day: prior, sales: 0, salesOverridden: true },
          {
            day: today,
            sales: 2,
            salesOverridden: true,
            annotations: {
              budget: { value: 40, currency: "PEN" },
              spend: { value: 999, currency: "PEN" },
            },
          },
        ],
      },
    },
  });
  try {
    await db.metaManualBaseDay.create({
      data: {
        tableId: table.id,
        country: "PE",
        day: today,
        allocations: [{ advisorId: null, quantity: 300 }],
      },
    });
    await db.metaAdvisorBaseDay.create({
      data: {
        tableId: table.id,
        country: "PE",
        day: today,
        allocations: [{ advisorId: null, quantity: 200 }],
      },
    });
    const a = await sheetAnalysis(owner, {
      tableId: table.id,
      since: prior,
      until: today,
    });
    assert.equal(a.rows[0].report.since, prior);
    assert.equal(a.rows[0].report.activeDays, 2);
    assert.equal(a.rows[0].report.budget, 40);
    assert.equal(a.rows[0].report.budgetCac, 20);
    assert.equal(a.rows[0].report.metaSpend, null);
    assert.equal(a.bases[0].bm, 300);
    assert.equal(a.bases[0].bc, 200);
    const d = await effectivenessDetail(owner, {
      aliasId: alias.id,
      country: "PE",
      since: today,
      until: today,
    });
    assert.equal(d.report.since, prior);
    assert.equal(d.report.sales, 2);
    await db.metaEffectivenessDay.create({
      data: {
        rowId: row.id,
        day: old,
        sales: 0,
        salesOverridden: true,
        annotations: { budget: { value: 10, currency: "PEN" } },
      },
    });
    const back = await sheetAnalysis(owner, {
      tableId: table.id,
      since: today,
      until: today,
    });
    assert.equal(back.rows[0].report.since, old);
    assert.equal(back.rows[0].report.activeDays, 3);
    assert.equal(back.rows[0].report.budget, 50);
    assert.equal((await sheetActivityStart(owner, table.id)).since, old);
    const statesBefore = await db.metaEffectivenessState.count({
      where: { aliasId: alias.id },
    });
    assert.equal(statesBefore, 0);
    const inv = await inventoryActivationReport(owner, {
      listId: list.id,
      tableIds: table.id,
      byCountry: "true",
    });
    assert.equal(inv.rows[0].activeDays, 3);
    assert.equal(inv.rows[0].sales, 2);
    assert.equal(inv.rows[0].budget, 50);
    assert.equal(
      await db.metaEffectivenessState.count({ where: { aliasId: alias.id } }),
      0,
    );
    const older = new Date(Date.parse(today) - 3 * 86400000)
      .toISOString()
      .slice(0, 10);
    const sourceAlias = await db.metaAlias.create({
      data: { tableId: other.id, name: alias.name },
    });
    await db.metaEffectivenessRow.create({
      data: {
        aliasId: sourceAlias.id,
        country: "PE",
        currency: "",
        displayCurrency: "PEN",
        days: {
          create: {
            day: older,
            annotations: { budget: { value: 15, currency: "PEN" } },
          },
        },
      },
    });
    await db.metaEffectivenessLink.create({
      data: { tableId: table.id, sourceTableId: other.id, columns: ["budget"] },
    });
    assert.equal(
      (
        await sheetAnalysis(owner, {
          tableId: table.id,
          since: today,
          until: today,
        })
      ).rows[0].report.since,
      older,
    );
    assert.equal(
      (
        await effectivenessDetail(owner, {
          aliasId: alias.id,
          country: "PE",
          since: today,
          until: today,
        })
      ).report.since,
      older,
    );
    assert.equal((await sheetActivityStart(owner, table.id)).since, older);
    await db.effectivenessGrant.create({
      data: {
        userId: viewer.id,
        scope: "TABLE:" + table.id,
        permission: "VIEW",
        grantedById: owner.id,
      },
    });
    const v = await authorizeFinancialRequest(
      viewer,
      "effectiveness/sheet-analysis",
      "GET",
      new URLSearchParams({ tableId: table.id, since: today, until: today }),
      null,
      "TABLE:" + table.id,
    );
    assert.equal(
      (
        await sheetAnalysis(v, {
          tableId: table.id,
          since: today,
          until: today,
        })
      ).rows.length,
      1,
    );
    await assert.rejects(
      sheetAnalysis(v, { tableId: other.id, since: today, until: today }),
    );
    await assert.rejects(sheetActivityStart(v, other.id));
    await db.metaManualBaseDay.update({
      where: {
        tableId_country_day: { tableId: table.id, country: "PE", day: today },
      },
      data: { state: "EMPTY", allocations: [] },
    });
    assert.equal(
      (
        await sheetAnalysis(owner, {
          tableId: table.id,
          since: today,
          until: today,
        })
      ).bases[0].bm,
      null,
    );
  } finally {
    await db.metaManualBaseDay.deleteMany({ where: { tableId: table.id } });
    await db.metaAdvisorBaseDay.deleteMany({ where: { tableId: table.id } });
    await db.metaEffectivenessLink.deleteMany({ where: { tableId: table.id } });
    await db.metaEffectivenessRow.deleteMany({
      where: { alias: { tableId: { in: [table.id, other.id] } } },
    });
    await db.metaAlias.deleteMany({
      where: { tableId: { in: [table.id, other.id] } },
    });
    await db.metaAliasTable.deleteMany({
      where: { id: { in: [table.id, other.id] } },
    });
    await db.metaEffectivenessSheet.delete({ where: { id: list.id } });
    await db.effectivenessGrant.deleteMany({ where: { userId: viewer.id } });
    await db.user.deleteMany({ where: { id: { in: [owner.id, viewer.id] } } });
    await db.$disconnect();
  }
});
