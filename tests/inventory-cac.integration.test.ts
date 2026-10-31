import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../lib/db";
import {
  inventoryActivationReport,
  financialCatalogStatus,
  inventoryActivationDirectory,
  saveInventoryFactorLimits,
} from "../lib/meta-ads/inventory-sheet-activation";
import { sheetAnalysis } from "../lib/meta-ads/sheet-analysis";
import { effectivenessDetail } from "../lib/meta-ads/effectiveness-detail";
import { authorizeFinancialRequest } from "../lib/meta-ads/financial-access";
import { limaDay } from "../lib/meta-ads/advisor-attribution";
test("CAC 14 days, country/source separation, selectable detail, new thresholds and scoped revision guards", async () => {
  assert(
    process.env.DATABASE_URL?.includes("library_organization_test") &&
      process.env.DATABASE_URL.includes("/workspace/work/pgdata"),
  );
  const tag = randomUUID(),
    today = limaDay(new Date()),
    date = (n: number) =>
      new Date(Date.parse(today) - n * 86400000).toISOString().slice(0, 10),
    older = date(14);
  const owner = await db.user.create({
      data: {
        name: "CAC QA",
        email: tag + "@example.test",
        passwordHash: "synthetic",
        role: "OWNER",
        status: "APPROVED",
      },
    }),
    viewer = await db.user.create({
      data: {
        name: "CAC VIEW",
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
    alias = await db.metaAlias.create({
      data: { name: tag, tableId: table.id, inventorySheetId: list.id },
    });
  const connection = await db.metaConnection.create({
      data: { ownerId: owner.id, name: tag, transport: "API" },
    }),
    account = await db.metaAdAccount.create({
      data: {
        id: Date.now() + "707",
        name: tag,
        connectionId: connection.id,
        currency: "PEN",
        timezone: "America/Lima",
      },
    }),
    object = await db.metaAdObject.create({
      data: {
        id: account.id + "01",
        accountId: account.id,
        name: tag,
        level: "campaign",
        aliasId: alias.id,
        aliasCountry: "PE",
      },
    });
  try {
    const na = { sales: { value: "NA" }, budget: { value: "NA" } };
    await db.metaEffectivenessRow.create({
      data: {
        aliasId: alias.id,
        country: "PE",
        currency: "",
        displayCurrency: "PEN",
        days: {
          create: [
            {
              day: older,
              sales: 100,
              salesOverridden: true,
              annotations: { budget: { value: 1, currency: "PEN" } },
            },
            ...Array.from({ length: 14 }, (_, n) => ({
              day: date(n),
              sales: n === 1 ? 1 : n === 0 ? 0 : null,
              salesOverridden: true,
              annotations:
                n < 2
                  ? {
                      budget: { value: n === 0 ? 50 : 0, currency: "PEN" },
                      spend: { value: 999, currency: "PEN" },
                    }
                  : na,
            })),
          ],
        },
      },
    });
    await db.metaEffectivenessRow.create({
      data: {
        aliasId: alias.id,
        country: "EC",
        currency: "",
        displayCurrency: "PEN",
        days: {
          create: {
            day: today,
            sales: 1,
            salesOverridden: true,
            annotations: { budget: { value: 20, currency: "PEN" } },
          },
        },
      },
    });
    await db.metaAdDaily.createMany({
      data: [today, date(1)].map((day) => ({
        accountId: account.id,
        objectId: object.id,
        day,
        scope: "7d_click,1d_view|impression",
        spend: 30,
        actions: { "onsite_conversion.messaging_conversation_started_7d": 100 },
      })),
    });
    const report = await inventoryActivationReport(owner, {
        listId: list.id,
        tableIds: table.id,
        byCountry: "true",
      }),
      pe = report.rows.find((r) => r.country === "PE")!,
      ec = report.rows.find((r) => r.country === "EC")!;
    assert.equal(pe.cac?.since, date(13));
    assert.equal(pe.cac?.days, 2);
    assert.equal(pe.cac?.sales, 1);
    assert.equal(pe.cac?.budget.cac, 50);
    assert.equal(pe.cac?.budget.assessment.status, "SEVERE");
    assert.equal(pe.cac?.meta.cac, 60);
    assert.equal(ec.cac?.budget.assessment.status, "WITHIN");
    const cat = await financialCatalogStatus(owner, { tableId: table.id });
    assert.equal(
      cat.rows.find((r) => r.country === "PE")?.cac?.budget.assessment.status,
      "SEVERE",
    );
    const sheet = await sheetAnalysis(owner, {
      tableId: table.id,
      since: today,
      until: today,
    });
    assert.equal(
      sheet.rows.find((r) => r.country === "PE")?.evaluation.budget.assessment
        .value,
      50,
    );
    const detail = await effectivenessDetail(owner, {
      aliasId: alias.id,
      country: "PE",
      since: today,
      until: today,
      reportSince: older,
      reportUntil: today,
    });
    assert.equal(detail.periodCac.sales, 101);
    assert.equal(detail.periodCac.budget.assessment.status, "WITHIN");
    assert.equal(detail.periodCac.budget.cac, 51 / 101);
    const before = await inventoryActivationDirectory(owner, {
      listId: list.id,
    });
    const oldLimits = before.limits;
    await assert.rejects(
      saveInventoryFactorLimits(owner, {
        listId: list.id,
        revision: before.revision,
        cacRules: { review: 60, severe: 35, critical: 65, zero: 25 },
      }),
    );
    await saveInventoryFactorLimits(owner, {
      listId: list.id,
      revision: before.revision,
      cacRules: { review: 40, severe: 60, critical: 80, zero: 25 },
    });
    await assert.rejects(
      saveInventoryFactorLimits(owner, {
        listId: list.id,
        revision: before.revision,
        cacRules: { review: 35, severe: 50, critical: 65, zero: 25 },
      }),
    );
    const after = await inventoryActivationDirectory(owner, {
      listId: list.id,
    });
    assert.deepEqual(after.limits, oldLimits);
    assert.equal(after.cacRules.review, 40);
    assert.equal(
      (await financialCatalogStatus(owner, { tableId: table.id })).rows.find(
        (r) => r.country === "PE",
      )?.cac?.budget.assessment.status,
      "ALERT",
    );
    await db.effectivenessGrant.create({
      data: {
        scope: "TAB:" + list.id,
        userId: viewer.id,
        grantedById: owner.id,
        permission: "VIEW",
      },
    });
    const v = await authorizeFinancialRequest(
      viewer,
      "inventory/sheet-activation/limits",
      "PUT",
      new URLSearchParams(),
      { listId: list.id },
      "TAB:" + list.id,
    ).catch(() => null);
    assert.equal(v, null);
    assert.equal(
      await db.metaEffectivenessEvent.count({
        where: { state: { aliasId: alias.id } },
      }),
      0,
    );
  } finally {
    await db.metaAdAccount.delete({ where: { id: account.id } });
    await db.metaConnection.delete({ where: { id: connection.id } });
    await db.metaEffectivenessRow.deleteMany({ where: { aliasId: alias.id } });
    await db.metaAlias.delete({ where: { id: alias.id } });
    await db.metaAliasTable.delete({ where: { id: table.id } });
    await db.metaEffectivenessSheet.delete({ where: { id: list.id } });
    await db.effectivenessGrant.deleteMany({ where: { userId: viewer.id } });
    await db.auditEvent.deleteMany({ where: { actorId: owner.id } });
    await db.user.deleteMany({ where: { id: { in: [owner.id, viewer.id] } } });
    await db.$disconnect();
  }
});
