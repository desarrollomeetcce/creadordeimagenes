import { linkInventorySheets } from "../lib/meta-ads/inventory-import";
import {
  previewRemoveInventorySelection,
  removeInventorySelection,
} from "../lib/meta-ads/inventory-catalog";
import { linkFinancialInventory } from "../lib/meta-ads/financial-inventory";
import { inventoryTrials } from "../lib/meta-ads/inventory-trials";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { db } from "../lib/db";
import { encryptKey } from "../lib/crypto";
import {
  assignAliases,
  metaAliasCatalog,
  aliasTables,
} from "../lib/meta-ads/aliases";
import { effectivenessDetail } from "../lib/meta-ads/effectiveness-detail";
import { effectiveness } from "../lib/meta-ads/effectiveness";
import {
  inventoryActivationChange,
  inventoryActivationReport,
} from "../lib/meta-ads/inventory-sheet-activation";
import { metaRoutes } from "../lib/meta-ads/routes";
import { limaDay } from "../lib/meta-ads/advisor-attribution";

test("Meta inventory assignment materializes catalog choices atomically and flags advisor onboarding", async (t) => {
  assert(
    process.env.DATABASE_URL?.includes("library_organization_test") &&
      process.env.DATABASE_URL.includes("/workspace/work/pgdata"),
    "Exclusive synthetic DB only",
  );
  const tag = randomUUID(),
    today = limaDay(),
    prefix =
      Date.now().toString() + Math.floor(Math.random() * 10000).toString();
  const owner = await db.user.create({
      data: {
        name: "QA Meta add " + tag,
        email: "meta-add-" + tag + "@example.test",
        passwordHash: "synthetic",
        role: "OWNER",
        status: "APPROVED",
      },
    }),
    actor = { id: owner.id, role: "OWNER" };
  const viewer = await db.user.create({
    data: {
      name: "QA Meta viewer " + tag,
      email: "meta-view-" + tag + "@example.test",
      passwordHash: "synthetic",
      role: "OBSERVER",
      status: "APPROVED",
    },
  });
  const list = await db.metaEffectivenessSheet.create({
      data: { kind: "INVENTORY", name: "Catalog " + tag },
    }),
    table = await db.metaAliasTable.create({
      data: {
        name: "Table " + tag,
        defaultCountry: "PE",
        defaultCurrency: "PEN",
      },
    });
  const category = await db.metaInventoryCategory.create({
    data: {
      sheetId: list.id,
      name: "Primary " + tag,
      key: "primary-" + tag,
      kind: "PRIMARY",
    },
  });
  const items = await Promise.all(
    ["A", "B", "C", "D"].map((n) =>
      db.metaInventoryItem.create({
        data: {
          sheetId: list.id,
          name: n + " " + tag,
          categories: { create: { categoryId: category.id } },
        },
      }),
    ),
  );
  const connection = await db.metaConnection.create({
    data: {
      ownerId: owner.id,
      name: "Synthetic " + tag,
      transport: "API",
      encryptedToken: encryptKey(
        "synthetic-meta-token-0000000000",
        "meta:pending",
      ),
      verifiedAt: new Date(),
    },
  });
  const accountId = prefix + "1",
    objectIds = [prefix + "2", prefix + "3", prefix + "4"];
  await db.metaAdAccount.create({
    data: {
      id: accountId,
      name: "Synthetic " + tag,
      connectionId: connection.id,
      currency: "PEN",
      timezone: "America/Lima",
      enabled: true,
    },
  });
  await db.metaAdObject.createMany({
    data: objectIds.map((id) => ({
      id,
      accountId,
      name: "Campaign " + id,
      level: "campaign",
      status: "ACTIVE",
      effectiveStatus: "ACTIVE",
    })),
  });
  const selection = (i: number) => ({
    tableId: table.id,
    catalogId: "item:" + items[i].id,
    inventorySheetId: list.id,
  });
  try {
    await t.test(
      "Catalog includes canonical items without requiring an alias in any sheet",
      async () => {
        const catalog = await metaAliasCatalog(actor);
        assert(catalog.some((i) => i.catalogId === "item:" + items[0].id));
        assert.equal(
          await db.metaAlias.count({ where: { tableId: table.id } }),
          0,
        );
      },
    );
    await t.test(
      "One bulk request adds once, copies categories, activates financial row and links only checked campaigns",
      async () => {
        const r = await assignAliases(
          actor,
          objectIds.slice(0, 2),
          null,
          "PE",
          undefined,
          selection(0),
        );
        assert(r.aliasId && r.addedToTable);
        assert.equal(r.count, 2);
        assert.equal(
          await db.metaAlias.count({
            where: { tableId: table.id, name: items[0].name },
          }),
          1,
        );
        assert.equal(
          await db.metaInventoryCategoryAssignment.count({
            where: { aliasId: r.aliasId, categoryId: category.id },
          }),
          1,
        );
        const source = await effectiveness(actor, table.id, today, today);
        const row = source.rows.find(
          (row) => row.aliasId === r.aliasId && row.country === "PE",
        )!;
        assert(row.active && row.pendingAssignmentAt);
        assert.equal(row.advisorId, null);
        assert.equal(
          (
            await db.metaAdObject.findUniqueOrThrow({
              where: { id: objectIds[2] },
            })
          ).aliasId,
          null,
        );
      },
    );
    await t.test(
      "Concurrent links reuse one diploma, promote an active Meta campaign once and preserve daily data",
      async () => {
        const alias = await db.metaAlias.findFirstOrThrow({
          where: { tableId: table.id, name: items[0].name },
        });
        const row = await db.metaEffectivenessRow.findFirstOrThrow({
          where: { aliasId: alias.id, country: "PE" },
        });
        await db.metaEffectivenessDay.create({
          data: { rowId: row.id, day: today, sales: 3 },
        });
        await db.metaEffectivenessState.update({
          where: { aliasId_country: { aliasId: alias.id, country: "PE" } },
          data: { active: false, revision: { increment: 1 } },
        });
        await Promise.all(
          objectIds
            .slice(0, 2)
            .map((id) =>
              assignAliases(actor, [id], null, "PE", undefined, selection(0)),
            ),
        );
        assert.equal(
          await db.metaAlias.count({
            where: { tableId: table.id, name: items[0].name },
          }),
          1,
        );
        assert.equal(
          await db.metaEffectivenessEvent.count({
            where: { state: { aliasId: alias.id, country: "PE" } },
          }),
          2,
        );
        assert.equal(
          (
            await db.metaEffectivenessState.findUniqueOrThrow({
              where: { aliasId_country: { aliasId: alias.id, country: "PE" } },
            })
          ).active,
          true,
        );
        assert.equal(
          (
            await db.metaEffectivenessDay.findUniqueOrThrow({
              where: { rowId_day: { rowId: row.id, day: today } },
            })
          ).sales,
          3,
        );
      },
    );
    await t.test(
      "Invalid selected object and late invalid advisor leave no partial catalog addition or link",
      async () => {
        await assert.rejects(
          assignAliases(
            actor,
            [objectIds[2], "9999999999999999999999999999999999999999"],
            null,
            "PE",
            undefined,
            selection(1),
          ),
        );
        await assert.rejects(
          assignAliases(
            actor,
            [objectIds[2]],
            null,
            "PE",
            "missing-advisor",
            selection(1),
          ),
        );
        assert.equal(
          await db.metaAlias.count({
            where: { tableId: table.id, name: items[1].name },
          }),
          0,
        );
        assert.equal(
          (
            await db.metaAdObject.findUniqueOrThrow({
              where: { id: objectIds[2] },
            })
          ).aliasId,
          null,
        );
      },
    );
    await t.test(
      "Manual typing creates a canonical diploma and table alias in the same save",
      async () => {
        await db.metaAdObject.update({
          where: { id: objectIds[2] },
          data: { status: "PAUSED", effectiveStatus: "PAUSED" },
        });
        const name = "New " + tag;
        const r = await assignAliases(
          actor,
          [objectIds[2]],
          null,
          "EC",
          undefined,
          { tableId: table.id, inventorySheetId: list.id, name },
        );
        assert(r.addedToTable);
        const imported = await effectiveness(actor, table.id, today, today);
        assert.equal(
          imported.rows.find(
            (row) => row.aliasId === r.aliasId && row.country === "EC",
          )!.active,
          false,
        );
        await db.metaAdObject.update({
          where: { id: objectIds[2] },
          data: { status: "ACTIVE", effectiveStatus: "ACTIVE" },
        });
        assert(
          await db.metaInventoryItem.findUnique({
            where: { sheetId_name: { sheetId: list.id, name } },
          }),
        );
        assert.equal(
          (
            await db.metaAdObject.findUniqueOrThrow({
              where: { id: objectIds[2] },
            })
          ).aliasCountry,
          "EC",
        );
      },
    );
    await t.test(
      "Inventory CREATE and replacement candidates are flagged without pins; completed advisor stays assigned on activation",
      async () => {
        await inventoryActivationChange(actor, {
          listId: list.id,
          tableId: table.id,
          country: "PE",
          items: [{ name: items[2].name, targets: [] }],
          campaignTask: "CREATE",
        });
        let report = await inventoryActivationReport(actor, {
          listId: list.id,
          tableIds: table.id,
          byCountry: "true",
        });
        const point = report.rows.find(
          (r) => r.name === items[2].name && r.country === "PE",
        )!;
        assert(!point.pinned && point.campaignTask === "CREATE");
        await assignAliases(
          actor,
          [objectIds[2]],
          point.targets[0].aliasId,
          "PE",
        );
        const linkedReport = await inventoryActivationReport(actor, {
          listId: list.id,
          tableIds: table.id,
          byCountry: "true",
        });
        const linkedPoint = linkedReport.rows.find(
          (r) => r.name === items[2].name && r.country === "PE",
        )!;
        assert.equal(linkedPoint.campaignTask, "NONE");
        assert.equal(linkedPoint.activation, "ACTIVE");
        assert.equal(
          await db.metaAlias.count({
            where: { tableId: table.id, name: items[2].name },
          }),
          1,
        );
        let source = await effectiveness(actor, table.id, today, today);
        assert(
          source.rows.find((r) => r.aliasId === point.targets[0].aliasId)!
            .pendingAssignmentAt,
        );
        const advisor = await db.metaAdvisor.create({
          data: {
            sheetId: (
              await db.metaEffectivenessSheet.create({
                data: { kind: "ADVISORS", name: "Advisors " + tag },
              })
            ).id,
            name: "Advisor " + tag,
          },
        });
        await db.metaEffectivenessRow.updateMany({
          where: { aliasId: point.targets[0].aliasId, country: "PE" },
          data: { advisorId: advisor.id },
        });
        await inventoryActivationChange(actor, {
          listId: list.id,
          tableId: table.id,
          country: "PE",
          items: [{ name: items[2].name, targets: linkedPoint.targets }],
          active: true,
          campaignTask: "NONE",
        });
        source = await effectiveness(actor, table.id, today, today);
        const row = source.rows.find(
          (r) => r.aliasId === point.targets[0].aliasId,
        )!;
        assert.equal(row.advisorId, advisor.id);
        assert.equal(row.active, true);
      },
    );
    await t.test(
      "Read-only users cannot query the complete catalog or materialize inventory; route supports new selection schema",
      async () => {
        await assert.rejects(
          metaAliasCatalog({ id: viewer.id, role: viewer.role }),
        );
        await assert.rejects(
          assignAliases(
            { id: viewer.id, role: viewer.role },
            [objectIds[2]],
            null,
            "PE",
            undefined,
            selection(3),
          ),
        );
        const path = "objects/" + objectIds[2] + "/alias";
        const response = await metaRoutes(
          new NextRequest("http://localhost/api/meta-ads/" + path, {
            method: "PATCH",
          }),
          ["meta-ads", ...path.split("/")],
          actor,
          async () => ({
            aliasId: null,
            country: "PE",
            selection: selection(3),
          }),
        );
        assert.equal(response.status, 200);
      },
    );
    await t.test(
      "Meta can complete initial advisor and currency atomically, without rewriting an existing currency or assignment history",
      async () => {
        const advisor = await db.metaAdvisor.findFirstOrThrow({
          where: { name: "Advisor " + tag },
        });
        const result = await assignAliases(
          actor,
          [objectIds[0]],
          null,
          "PE",
          advisor.id,
          {
            tableId: table.id,
            inventorySheetId: list.id,
            name: "Complete " + tag,
          },
          "USD",
        );
        const report = await effectiveness(actor, table.id, today, today);
        const row = report.rows.find(
          (r) => r.aliasId === result.aliasId && r.country === "PE",
        )!;
        assert.equal(row.advisorId, advisor.id);
        assert.equal(row.currency, "USD");
        assert(row.active);
        assert.equal(
          await db.metaAdvisorAssignment.count({
            where: {
              aliasId: result.aliasId!,
              country: "PE",
              advisorId: advisor.id,
            },
          }),
          1,
        );
        await assignAliases(
          actor,
          [objectIds[0]],
          result.aliasId!,
          "PE",
          advisor.id,
          undefined,
          "USD",
        );
        assert.equal(
          await db.metaAdvisorAssignment.count({
            where: { aliasId: result.aliasId!, country: "PE" },
          }),
          1,
        );
        await assert.rejects(
          assignAliases(
            actor,
            [objectIds[0]],
            result.aliasId!,
            "PE",
            advisor.id,
            undefined,
            "PEN",
          ),
          /moneda/,
        );
        assert.equal(
          (
            await db.metaEffectivenessRow.findFirstOrThrow({
              where: { aliasId: result.aliasId! },
            })
          ).displayCurrency,
          "USD",
        );
      },
    );
    await t.test(
      "Unpinning hides the row without removing complete country statistics",
      async () => {
        const alias = await db.metaAlias.findFirstOrThrow({
          where: { tableId: table.id, name: "Complete " + tag },
        });
        const current = await inventoryActivationReport(actor, {
          listId: list.id,
          tableIds: table.id,
          byCountry: "true",
        });
        const target = current.rows.find(
          (r) => r.name === "Complete " + tag && r.country === "PE",
        )!;
        await inventoryActivationChange(actor, {
          listId: list.id,
          tableId: table.id,
          country: "PE",
          items: [{ name: target.name, targets: target.targets }],
          active: false,
          pinned: false,
        });
        const detail = await effectivenessDetail(actor, {
          aliasId: alias.id,
          country: "PE",
          since: today,
          until: today,
        });
        assert.equal(detail.active, false);
        assert.equal(detail.name, "Complete " + tag);
      },
    );
    await t.test(
      "Removing only sheet membership preserves closed activation history, daily sales, advisor and identity when reattached",
      async () => {
        const alias = await db.metaAlias.findFirstOrThrow({
          where: { tableId: table.id, name: "Complete " + tag },
        });
        const row = await db.metaEffectivenessRow.findFirstOrThrow({
          where: { aliasId: alias.id, country: "PE", currency: "" },
        });
        await db.metaEffectivenessDay.upsert({
          where: { rowId_day: { rowId: row.id, day: today } },
          create: {
            rowId: row.id,
            day: today,
            sales: 3,
            salesOverridden: true,
          },
          update: { sales: 3, salesOverridden: true },
        });
        const events = await db.metaEffectivenessEvent.count({
          where: { state: { aliasId: alias.id } },
        });
        const preview = await previewRemoveInventorySelection(actor, list.id, [
          alias.id,
        ]);
        await removeInventorySelection(actor, {
          listId: list.id,
          preserveCatalog: true,
          entries: preview.items.map((i) => ({ id: i.id, token: i.token })),
        });
        assert.equal(await db.metaAlias.count({ where: { id: alias.id } }), 1);
        assert(
          (
            await db.metaEffectivenessRow.findUniqueOrThrow({
              where: { id: row.id },
            })
          ).hidden,
        );
        assert.equal(
          await db.metaEffectivenessEvent.count({
            where: { state: { aliasId: alias.id } },
          }),
          events,
        );
        const tables = await aliasTables(actor);
        assert(
          tables
            .find((t) => t.id === table.id)!
            .aliases.find((a) => a.id === alias.id)!.detached,
        );
        const catalog = await inventoryTrials(actor, { listId: list.id });
        assert(
          !catalog.catalog
            .find((i) => i.name === alias.name)!
            .sheets?.some((t) => t.id === table.id),
        );
        const report = await inventoryActivationReport(actor, {
          listId: list.id,
          tableIds: table.id,
          byCountry: "true",
        });
        const point = report.rows.find(
          (r) => r.name === alias.name && r.country === "PE",
        )!;
        assert.equal(point.activation, "INACTIVE");
        assert.notEqual(point.usage, "NEVER");
        assert.equal(
          (
            await effectivenessDetail(actor, {
              aliasId: alias.id,
              country: "PE",
              since: today,
              until: today,
            })
          ).days[today].sales,
          3,
        );
        const currentList = await db.metaEffectivenessSheet.findUniqueOrThrow({
          where: { id: list.id },
        });
        const canonical = await db.metaInventoryItem.findFirstOrThrow({
          where: { sheetId: list.id, name: alias.name },
        });
        await linkInventorySheets(actor, {
          listId: list.id,
          revision: currentList.categoryRevision,
          inventoryId: canonical.id,
          expectedName: alias.name,
          tableIds: [table.id],
        });
        assert.equal(
          await db.metaAlias.count({
            where: { tableId: table.id, name: alias.name },
          }),
          1,
        );
        assert.equal(
          (
            await db.metaEffectivenessState.findUniqueOrThrow({
              where: { aliasId_country: { aliasId: alias.id, country: "PE" } },
            })
          ).active,
          false,
        );
        assert.equal(
          await db.metaEffectivenessEvent.count({
            where: { state: { aliasId: alias.id } },
          }),
          events,
        );
        assert.equal(
          (
            await effectivenessDetail(actor, {
              aliasId: alias.id,
              country: "PE",
              since: today,
              until: today,
            })
          ).days[today].sales,
          3,
        );
      },
    );
    await t.test(
      "Historical G Meta uses received spend, preserves zero and never substitutes manual G",
      async () => {
        const alias = await db.metaAlias.findFirstOrThrow({
          where: { tableId: table.id, name: items[0].name },
        });
        const state = await db.metaEffectivenessState.findUniqueOrThrow({
          where: { aliasId_country: { aliasId: alias.id, country: "PE" } },
        });
        await db.metaEffectivenessEvent.deleteMany({
          where: { stateId: state.id },
        });
        await db.metaEffectivenessState.update({
          where: { id: state.id },
          data: { active: false },
        });
        await db.metaEffectivenessEvent.createMany({
          data: [
            {
              stateId: state.id,
              actorId: owner.id,
              active: true,
              createdAt: new Date(today + "T05:00:00Z"),
              snapshot: { priorActive: false },
            },
            {
              stateId: state.id,
              actorId: owner.id,
              active: false,
              createdAt: new Date(today + "T06:00:00Z"),
              snapshot: { priorActive: true },
            },
          ],
        });
        const row = await db.metaEffectivenessRow.findFirstOrThrow({
          where: { aliasId: alias.id, country: "PE" },
        });
        await db.metaEffectivenessDay.update({
          where: { rowId_day: { rowId: row.id, day: today } },
          data: {
            annotations: {
              spend: { value: 999, currency: "PEN" },
              budget: { value: 25, currency: "PEN" },
            },
          },
        });
        await db.metaAdObject.update({
          where: { id: objectIds[0] },
          data: { aliasId: alias.id, aliasCountry: "PE" },
        });
        const read = async () =>
          (
            await inventoryActivationReport(actor, {
              listId: list.id,
              tableIds: table.id,
              country: "PE",
              historyName: alias.name,
            })
          ).rows[0].history![0];
        let h = await read();
        assert.equal(h.metaSpend, null);
        assert.equal(h.metaAssessment!.status, "PENDING");
        await db.metaAdDaily.create({
          data: {
            objectId: objectIds[0],
            accountId,
            day: today,
            scope: "7d_click,1d_view|impression",
            spend: 3,
            impressions: 100,
            actions: {},
          },
        });
        h = await read();
        assert.equal(h.metaSpend, 3);
        assert.equal(h.budget, 25);
        assert.equal(h.hours, 1);
        await db.metaAdDaily.updateMany({
          where: { objectId: objectIds[0] },
          data: { spend: 0 },
        });
        h = await read();
        assert.equal(h.metaSpend, 0);
        assert.notEqual(h.metaSpend, 999);
      },
    );
  } finally {
    await db.metaAdObject.deleteMany({ where: { accountId } });
    await db.metaEffectivenessEvent.deleteMany({
      where: { state: { alias: { tableId: table.id } } },
    });
    await db.metaEffectivenessState.deleteMany({
      where: { alias: { tableId: table.id } },
    });
    await db.metaEffectivenessRow.deleteMany({
      where: { alias: { tableId: table.id } },
    });
    await db.metaInventoryCategoryAssignment.deleteMany({
      where: { alias: { tableId: table.id } },
    });
    await db.metaAlias.deleteMany({ where: { tableId: table.id } });
    await db.metaAliasTable.delete({ where: { id: table.id } });
    await db.metaInventoryItem.deleteMany({ where: { sheetId: list.id } });
    await db.metaEffectivenessSheet.delete({ where: { id: list.id } });
    const advisers = await db.metaEffectivenessSheet.findMany({
      where: { name: "Advisors " + tag },
    });
    await db.metaAdvisor.deleteMany({
      where: { sheetId: { in: advisers.map((a) => a.id) } },
    });
    await db.metaEffectivenessSheet.deleteMany({
      where: { id: { in: advisers.map((a) => a.id) } },
    });
    await db.metaAdAccount.deleteMany({ where: { id: accountId } });
    await db.metaConnection.delete({ where: { id: connection.id } });
    await db.auditEvent.deleteMany({
      where: { actorId: { in: [owner.id, viewer.id] } },
    });
    await db.user.deleteMany({ where: { id: { in: [owner.id, viewer.id] } } });
    await db.$disconnect();
  }
});
