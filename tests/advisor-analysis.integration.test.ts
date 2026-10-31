import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../lib/db";
import { advisorSheet, personalAdvisorSheet } from "../lib/meta-ads/advisors";
import { limaDay } from "../lib/meta-ads/advisor-attribution";
import { advisorFinancialSummary } from "../lib/meta-ads/advisor-financial-summary";
test("Análisis de asesor: bases agregadas, P/V, Meta original, país/producto y privacidad del portal", async () => {
  assert(
    process.env.DATABASE_URL?.includes("library_organization_test") &&
      process.env.DATABASE_URL.includes("/workspace/work/pgdata"),
    "Base exclusiva",
  );
  const tag = randomUUID(),
    today = limaDay(),
    yesterday = new Date(Date.parse(today) - 86400000)
      .toISOString()
      .slice(0, 10);
  const owner = await db.user.create({
    data: {
      name: "Análisis QA",
      email: tag + "@example.test",
      role: "OWNER",
      status: "APPROVED",
      passwordHash: "synthetic",
    },
  });
  const user = await db.user.create({
    data: {
      name: "Asesor QA",
      email: "advisor-" + tag + "@example.test",
      role: "USER",
      status: "APPROVED",
      passwordHash: "synthetic",
    },
  });
  const list = await db.metaEffectivenessSheet.create({
    data: { kind: "ADVISORS", name: "Análisis " + tag },
  });
  const advisor = await db.metaAdvisor.create({
    data: { sheetId: list.id, name: "Ana " + tag },
  });
  const alternate = await db.metaAdvisor.create({
    data: { sheetId: list.id, name: "Otro asesor " + tag },
  });
  const table = await db.metaAliasTable.create({
    data: {
      name: "Análisis " + tag,
      defaultCountry: "PE",
      defaultCurrency: "PEN",
    },
  });
  const connection = await db.metaConnection.create({
    data: {
      ownerId: owner.id,
      name: "Análisis " + tag,
      transport: "API",
      verifiedAt: new Date(),
    },
  });
  const account = await db.metaAdAccount.create({
    data: {
      id: Date.now() + "101",
      connectionId: connection.id,
      name: "QA",
      currency: "PEN",
      timezone: "America/Lima",
    },
  });
  const aliases: string[] = [];
  try {
    await db.metaAdvisorPortal.create({
      data: { userId: user.id, advisorId: advisor.id, revision: 0 },
    });
    for (let i = 0; i < 2; i++) {
      const alias = await db.metaAlias.create({
        data: { tableId: table.id, name: "Curso " + i + " " + tag },
      });
      aliases.push(alias.id);
      const row = await db.metaEffectivenessRow.create({
        data: {
          aliasId: alias.id,
          country: "PE",
          currency: "",
          displayCurrency: "PEN",
          advisorId: advisor.id,
        },
      });
      const campaign = await db.metaAdObject.create({
        data: {
          id: account.id + String(i),
          accountId: account.id,
          level: "campaign",
          name: "Curso " + i,
          aliasId: alias.id,
          aliasCountry: "PE",
        },
      });
      for (const day of [yesterday, today]) {
        await db.metaEffectivenessDay.create({
          data: {
            rowId: row.id,
            day,
            sales: i ? 3 : 2,
            salesOverridden: true,
            annotations: {
              budget: { value: i ? 40 : 20, currency: "PEN" },
              base: { value: 999 },
              spend: { value: 888, currency: "PEN" },
            },
          },
        });
        await db.metaAdDaily.create({
          data: {
            accountId: account.id,
            objectId: campaign.id,
            day,
            scope: "7d_click,1d_view|impression",
            spend: i ? 60 : 30,
            actions: {
              "onsite_conversion.messaging_conversation_started_7d": i
                ? 200
                : 100,
            },
          },
        });
      }
    }
    for (const day of [yesterday, today]) {
      await db.metaAdvisorBaseDay.create({
        data: {
          tableId: table.id,
          country: "PE",
          day,
          allocations: [{ advisorId: advisor.id, quantity: 200 }],
        },
      });
      await db.metaManualBaseDay.create({
        data: {
          tableId: table.id,
          country: "PE",
          day,
          allocations: [{ advisorId: advisor.id, quantity: 300 }],
        },
      });
    }
    const data = await advisorSheet(owner, table.id, yesterday, today, {
      advisorId: advisor.id,
      country: "PE",
    });
    const d = data.rows[0].days[today];
    assert.equal(d.sales, 5);
    assert.equal(d.advisorBase, 200);
    assert.equal(d.manualBase, 300);
    const summary = advisorFinancialSummary(
      Object.entries(data.rows[0].days).map(([day, d]) => ({
        day,
        sales: d.sales,
        financial: d.financial,
      })),
    );
    assert.equal(summary.money[0].budget, 120);
    assert.equal(summary.money[0].budgetCac, 12);
    assert.equal(summary.money[0].spend, 180);
    assert.equal(summary.money[0].metaCac, 18);
    assert.equal(summary.base, 600);
    assert.equal(summary.effectiveness, (10 / 600) * 100);
    assert(summary.updatedAt);
    const one = await advisorSheet(owner, table.id, today, today, {
      advisorId: advisor.id,
      aliasId: aliases[0],
      country: "PE",
    });
    assert.equal(one.rows[0].days[today].sales, 2);
    assert.equal(one.rows[0].days[today].advisorBase, 200);
    assert.equal(one.rows[0].days[today].financial?.base, 100);
    assert.equal(one.rows[0].days[today].financial?.currencies[0].spend, 30);
    const other = await advisorSheet(owner, table.id, today, today, {
      advisorId: advisor.id,
      country: "EC",
    });
    assert.equal(other.rows[0].days[today].financial, undefined);
    // Existing Meta reports precede onboarding; sales were explicitly allocated by hand.
    for (const [index, aliasId] of aliases.entries()) {
      await db.metaAdvisorAssignment.create({
        data: {
          aliasId,
          country: "PE",
          advisorId: advisor.id,
          previousAdvisorId: null,
          effectiveAt: new Date(today + "T00:00:00-05:00"),
          mode: "DAY",
        },
      });
      const row = await db.metaEffectivenessRow.findFirstOrThrow({
        where: { aliasId, country: "PE", legacy: false },
      });
      await db.metaAdvisorSalesApproval.create({
        data: {
          rowId: row.id,
          actorId: owner.id,
          day: yesterday,
          salesTotal: index ? 3 : 2,
          allocations: [
            {
              advisorId: index ? advisor.id : alternate.id,
              sales: index ? 3 : 2,
            },
          ],
          basis: { events: [], activeAdvisorId: null },
        },
      });
    }
    const past = await advisorSheet(owner, table.id, yesterday, yesterday, {
      advisorId: advisor.id,
      country: "PE",
    });
    const pastDay = past.rows[0].days[yesterday];
    assert.equal(pastDay.financial?.base, 300);
    assert.equal(pastDay.financial?.currencies[0].spend, 90);
    assert.equal(pastDay.financial?.currencies[0].budget, null);
    assert.equal(pastDay.sales, 3);
    assert(pastDay.financial?.updatedAt);
    assert.equal(pastDay.financial?.assignmentPartial, false);
    const alternatePast = await advisorSheet(
      owner,
      table.id,
      yesterday,
      yesterday,
      { advisorId: alternate.id, country: "PE" },
    );
    assert.equal(alternatePast.rows[0].days[yesterday].sales, 2);
    assert.equal(alternatePast.rows[0].days[yesterday].financial?.base, null);
    assert.equal(
      alternatePast.rows[0].days[yesterday].financial?.currencies[0].spend,
      null,
    );
    // A later transfer must not move bootstrap history to the new current advisor.
    await db.metaAdvisorAssignment.create({
      data: {
        aliasId: aliases[1],
        country: "PE",
        advisorId: alternate.id,
        previousAdvisorId: advisor.id,
        effectiveAt: new Date(today + "T00:01:00-05:00"),
        mode: "CLOCK",
        cutoffSales: 0,
      },
    });
    await db.metaEffectivenessRow.updateMany({
      where: { aliasId: aliases[1] },
      data: { advisorId: alternate.id },
    });
    const retained = await advisorSheet(owner, table.id, yesterday, yesterday, {
      advisorId: advisor.id,
      country: "PE",
    });
    assert.equal(retained.rows[0].days[yesterday].financial?.base, 300);
    assert.equal(
      retained.rows[0].days[yesterday].financial?.currencies[0].spend,
      90,
    );
    assert.equal(retained.rows[0].days[yesterday].sales, 3);
    const team = await advisorSheet(owner, table.id, yesterday, yesterday, {
      advisorListId: list.id,
      country: "PE",
    });
    assert.equal(
      team.rows.reduce(
        (n, p) => n + (p.days[yesterday].financial?.base ?? 0),
        0,
      ),
      300,
    );
    assert.equal(
      await db.metaAdvisorAssignment.count({
        where: { aliasId: { in: aliases } },
      }),
      3,
    );
    const personal = await personalAdvisorSheet(user, advisor.id, today, today);
    assert.equal(personal.rows[0].days[today].financial, undefined);
    assert(!JSON.stringify(personal).includes('"budget"'));
    assert.equal(
      await db.metaEffectivenessDay.count({
        where: { row: { aliasId: { in: aliases } } },
      }),
      4,
    );
  } finally {
    await db.metaAdAccount.delete({ where: { id: account.id } });
    await db.metaConnection.delete({ where: { id: connection.id } });
    await db.metaEffectivenessRow.deleteMany({
      where: { aliasId: { in: aliases } },
    });
    await db.metaAlias.deleteMany({ where: { id: { in: aliases } } });
    await db.metaAdvisorBaseDay.deleteMany({ where: { tableId: table.id } });
    await db.metaManualBaseDay.deleteMany({ where: { tableId: table.id } });
    await db.metaAliasTable.delete({ where: { id: table.id } });
    await db.metaAdvisorPortal.deleteMany({ where: { advisorId: advisor.id } });
    await db.metaAdvisor.deleteMany({
      where: { id: { in: [advisor.id, alternate.id] } },
    });
    await db.metaEffectivenessSheet.delete({ where: { id: list.id } });
    await db.user.deleteMany({ where: { id: { in: [owner.id, user.id] } } });
    await db.$disconnect();
  }
});
