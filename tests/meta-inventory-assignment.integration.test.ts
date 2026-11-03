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
  renameAliasTable,
  aliasTableOptions,
  inventoryMetaCandidates,
  metaAssignmentContext,
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
import {
  advisorSalesReview,
  approveAdvisorSales,
} from "../lib/meta-ads/advisor-sales-approval";
import { assignRowAdvisor } from "../lib/meta-ads/advisors";
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
      "Row sync candidates are read-only, campaign-only, preserve country and require Meta editor",
      async () => {
        const alias = await db.metaAlias.findFirstOrThrow({
          where: { tableId: table.id, name: items[0].name },
        });
        const before = await db.metaAdObject.findMany({
          where: { accountId },
          orderBy: { id: "asc" },
        });
        const linked = await inventoryMetaCandidates(actor, {
          tableId: table.id,
          country: "PE",
          aliasId: alias.id,
        });
        assert.deepEqual(
          linked.campaigns.map((c) => c.id).sort(),
          objectIds.slice(0, 2).sort(),
        );
        assert(linked.campaigns.every((c) => c.linkedHere));
        const fromCatalog = await inventoryMetaCandidates(actor, {
          tableId: table.id,
          country: "PE",
          catalogId: "item:" + items[1].id,
        });
        assert.deepEqual(fromCatalog.campaigns, []);
        const unlinked = await inventoryMetaCandidates(actor, {
          tableId: table.id,
          country: "PE",
          catalogId: "item:" + items[1].id,
          q: objectIds[2],
        });
        assert.deepEqual(
          unlinked.campaigns.map((c) => c.id),
          [objectIds[2]],
        );
        const wrongCountry = await inventoryMetaCandidates(actor, {
          tableId: table.id,
          country: "EC",
          aliasId: alias.id,
        });
        assert.deepEqual(wrongCountry.campaigns, []);
        await assert.rejects(() =>
          inventoryMetaCandidates(
            { id: viewer.id, role: "OBSERVER" },
            { tableId: table.id, country: "PE", aliasId: alias.id },
          ),
        );
        await assert.rejects(() =>
          inventoryMetaCandidates(actor, {
            tableId: table.id,
            country: "PE",
            aliasId: "missing",
          }),
        );
        await assert.rejects(() =>
          inventoryMetaCandidates(actor, {
            tableId: table.id,
            country: "PE",
            aliasId: alias.id,
            q: "x",
          }),
        );
        await assert.rejects(() =>
          assignAliases(
            actor,
            [objectIds[0]],
            alias.id,
            "EC",
            undefined,
            undefined,
            undefined,
            undefined,
            true,
          ),
        );
        await assignAliases(
          actor,
          [objectIds[0]],
          alias.id,
          "PE",
          undefined,
          undefined,
          undefined,
          undefined,
          true,
        );
        assert.equal(
          await db.metaEffectivenessRow.count({
            where: { aliasId: alias.id, country: "PE", legacy: false },
          }),
          1,
        );
        assert.deepEqual(
          await db.metaAdObject.findMany({
            where: { accountId },
            orderBy: { id: "asc" },
          }),
          before,
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
            sales: 3,
            salesOverridden: true,
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
        const detail = await effectivenessDetail(actor, {
          aliasId: alias.id,
          country: "PE",
          since: today,
          until: today,
        });
        assert.equal(detail.lifetime.sales, 3);
        assert.equal(detail.lifetime.budget, 25);
        assert.equal(detail.lifetime.metaSpend, 0);
        assert.equal(detail.lifetime.activeDays, 1);
        assert.equal(detail.lifetime.activeHours, 1);
        assert.equal(detail.lifetime.timePartial, false);
      },
    );
    await t.test(
      "Meta trae asesor/moneda de hoja o asesor único de inventario; no escribe al consultar y rechaza contexto antiguo",
      async () => {
        const person = await db.metaAdvisor.findFirstOrThrow({
          where: { sheet: { name: "Advisors " + tag } },
        });
        const second = await db.metaAdvisor.create({
          data: { sheetId: person.sheetId, name: "Segundo contexto " + tag },
        });
        const item = await db.metaInventoryItem.create({
          data: { sheetId: list.id, name: "Contexto " + tag },
        });
        await db.metaInventoryAdvisor.create({
          data: { itemId: item.id, advisorId: person.id },
        });
        const before = await db.metaAlias.count({
          where: { tableId: table.id },
        });
        const ctx = await metaAssignmentContext(actor, {
          tableId: table.id,
          country: "PE",
          catalogId: "item:" + item.id,
        });
        assert.equal(ctx.advisorId, person.id);
        assert.equal(ctx.source, "inventory");
        assert.equal(ctx.currency, "");
        assert.equal(ctx.aliasId, null);
        assert.equal(
          await db.metaAlias.count({ where: { tableId: table.id } }),
          before,
        );
        await assert.rejects(
          metaAssignmentContext(
            { id: viewer.id, role: viewer.role },
            { tableId: table.id, country: "PE", catalogId: "item:" + item.id },
          ),
        );
        const expected = {
          aliasId: ctx.aliasId,
          tableId: ctx.tableId,
          country: ctx.country,
          revision: ctx.revision,
          inventoryId: ctx.inventoryId,
          advisorRevision: ctx.advisorRevision,
        };
        await db.metaInventoryItem.update({
          where: { id: item.id },
          data: { advisorRevision: { increment: 1 } },
        });
        await assert.rejects(
          assignAliases(
            actor,
            [objectIds[2]],
            null,
            "PE",
            person.id,
            { tableId: table.id, catalogId: "item:" + item.id },
            "PEN",
            expected,
          ),
          /inventario cambiaron/,
        );
        assert.equal(
          await db.metaAlias.count({ where: { tableId: table.id } }),
          before,
        );
        const fresh = await metaAssignmentContext(actor, {
          tableId: table.id,
          country: "PE",
          catalogId: "item:" + item.id,
        });
        const linked = await assignAliases(
          actor,
          [objectIds[2]],
          null,
          "PE",
          person.id,
          { tableId: table.id, catalogId: "item:" + item.id },
          "PEN",
          {
            aliasId: fresh.aliasId,
            tableId: fresh.tableId,
            country: fresh.country,
            revision: fresh.revision,
            inventoryId: fresh.inventoryId,
            advisorRevision: fresh.advisorRevision,
          },
        );
        const saved = await metaAssignmentContext(actor, {
          tableId: table.id,
          country: "PE",
          aliasId: linked.aliasId!,
        });
        assert.equal(saved.source, "row");
        assert.equal(saved.advisorId, person.id);
        assert.equal(saved.currency, "PEN");
        await db.metaInventoryAdvisor.create({
          data: { itemId: item.id, advisorId: second.id },
        });
        await db.metaInventoryItem.update({
          where: { id: item.id },
          data: { advisorRevision: { increment: 1 } },
        });
        const otherCountry = await metaAssignmentContext(actor, {
          tableId: table.id,
          country: "EC",
          aliasId: linked.aliasId!,
        });
        assert.equal(otherCountry.advisorId, null);
        assert.equal(otherCountry.inventoryAdvisors.length, 2);
        await db.metaEffectivenessRow.updateMany({
          where: { aliasId: linked.aliasId!, country: "PE" },
          data: { revision: { increment: 1 } },
        });
        await assert.rejects(
          assignAliases(
            actor,
            [objectIds[2]],
            linked.aliasId!,
            "PE",
            person.id,
            undefined,
            "PEN",
            {
              aliasId: saved.aliasId,
              tableId: saved.tableId,
              country: saved.country,
              revision: saved.revision,
            },
          ),
          /hoja cambiaron/,
        );
      },
    );
    await t.test(
      "Ecuador Inocuidad: different advisor links and imports metrics once, review persists and manual choice resolves",
      async () => {
        const sheet = await db.metaEffectivenessSheet.findFirstOrThrow({
          where: { name: "Advisors " + tag },
        });
        const first = await db.metaAdvisor.findFirstOrThrow({
          where: { sheetId: sheet.id },
        });
        const second = await db.metaAdvisor.create({
          data: { sheetId: sheet.id, name: "Otro asesor " + tag },
        });
        const name = "Inocuidad alimentaria " + tag;
        const linked = await assignAliases(
          actor,
          [objectIds[2]],
          null,
          "EC",
          undefined,
          { tableId: table.id, inventorySheetId: list.id, name },
        );
        const aliasId = linked.aliasId!;
        let row = await db.metaEffectivenessRow.findFirstOrThrow({
          where: { aliasId, country: "EC", currency: "" },
        });
        await assignRowAdvisor(actor, {
          aliasId,
          country: "EC",
          advisorId: first.id,
          revision: row.revision,
          day: today,
          mode: "DAY",
        });
        row = await db.metaEffectivenessRow.findFirstOrThrow({
          where: { aliasId, country: "EC", currency: "" },
        });
        await db.metaEffectivenessDay.create({
          data: { rowId: row.id, day: today, sales: 6 },
        });
        const salesReview = await advisorSalesReview(actor, {
          aliasId,
          country: "EC",
          day: today,
        });
        await approveAdvisorSales(actor, {
          aliasId,
          country: "EC",
          day: today,
          revision: salesReview.revision,
          token: salesReview.token,
          allocations: [
            { advisorId: first.id, sales: 4 },
            { advisorId: second.id, sales: 2 },
          ],
        });
        await db.metaAdDaily.upsert({
          where: {
            objectId_day_scope: {
              objectId: objectIds[2],
              day: today,
              scope: "7d_click,1d_view|impression",
            },
          },
          create: {
            objectId: objectIds[2],
            accountId,
            day: today,
            scope: "7d_click,1d_view|impression",
            spend: 7,
            actions: {
              "onsite_conversion.messaging_conversation_started_7d": 3,
            },
          },
          update: { spend: 7 },
        });
        const before = (
          await effectiveness(actor, table.id, today, today)
        ).rows.find((r) => r.aliasId === aliasId && r.country === "EC")!;
        assert.equal(before.days[today].metaSpend, 7);
        assert.equal(before.days[today].sourceBase, 3);
        const history = await db.metaAdvisorAssignment.count({
          where: { aliasId, country: "EC" },
        });
        const result = await assignAliases(
          actor,
          [objectIds[2]],
          aliasId,
          "EC",
          second.id,
        );
        assert.equal(result.advisorReview, true);
        await assignAliases(actor, [objectIds[2]], aliasId, "EC", second.id);
        let after = (
          await effectiveness(actor, table.id, today, today)
        ).rows.find((r) => r.aliasId === aliasId && r.country === "EC")!;
        assert.equal(after.advisorId, first.id);
        assert.deepEqual(after.days, before.days);
        assert.equal(after.advisorReviews?.length, 1);
        assert.equal(after.advisorReviews?.[0].advisorId, second.id);
        assert.equal(
          await db.metaAlias.count({ where: { tableId: table.id, name } }),
          1,
        );
        assert.equal(
          await db.metaInventoryItem.count({
            where: { sheetId: list.id, name },
          }),
          1,
        );
        assert.equal(
          await db.metaEffectivenessRow.count({
            where: { aliasId, country: "EC", currency: "" },
          }),
          1,
        );
        assert.equal(
          await db.metaAdvisorAssignment.count({
            where: { aliasId, country: "EC" },
          }),
          history,
        );
        const object = await db.metaAdObject.findUniqueOrThrow({
          where: { id: objectIds[2] },
        });
        assert.equal(object.aliasCountry, "EC");
        assert.equal(object.aliasId, aliasId);
        assert.equal(object.advisorId, first.id);
        await assert.rejects(
          assignRowAdvisor(actor, {
            aliasId,
            country: "EC",
            advisorId: second.id,
            revision: before.rowRevision,
            day: today,
            mode: "DAY",
          }),
          /fila cambió/,
        );
        await assignRowAdvisor(actor, {
          aliasId,
          country: "EC",
          advisorId: first.id,
          revision: after.rowRevision,
          day: today,
          mode: "DAY",
        });
        after = (await effectiveness(actor, table.id, today, today)).rows.find(
          (r) => r.aliasId === aliasId && r.country === "EC",
        )!;
        assert(!after.advisorReviews?.length);
        assert.equal(after.advisorId, first.id);
        assert.equal(
          (await assignAliases(actor, [objectIds[2]], aliasId, "EC", first.id))
            .advisorReview,
          false,
        );
        await assignAliases(actor, [objectIds[2]], aliasId, "EC", second.id);
        row = await db.metaEffectivenessRow.findFirstOrThrow({
          where: { aliasId, country: "EC", currency: "" },
        });
        await assignRowAdvisor(actor, {
          aliasId,
          country: "EC",
          advisorId: second.id,
          revision: row.revision,
          day: today,
          mode: "DAY",
        });
        after = (await effectiveness(actor, table.id, today, today)).rows.find(
          (r) => r.aliasId === aliasId && r.country === "EC",
        )!;
        assert.equal(after.advisorId, second.id);
        assert(!after.advisorReviews?.length);
        const keptSales = await advisorSalesReview(actor, {
          aliasId,
          country: "EC",
          day: today,
        });
        assert.equal(keptSales.total, 6);
        assert.equal(
          keptSales.allocations.find((a) => a.advisorId === first.id)?.sales,
          4,
        );
        assert.equal(
          keptSales.allocations.find((a) => a.advisorId === second.id)?.sales,
          2,
        );
        await db.metaEffectivenessRow.updateMany({
          where: { aliasId, country: "EC" },
          data: { hidden: true },
        });
        await db.metaAdObject.update({
          where: { id: objectIds[2] },
          data: { status: "PAUSED", effectiveStatus: "PAUSED" },
        });
        await assignAliases(actor, [objectIds[2]], aliasId, "EC");
        assert.equal(
          (
            await db.metaEffectivenessRow.findFirstOrThrow({
              where: { aliasId, country: "EC", currency: "" },
            })
          ).hidden,
          false,
        );
        assert.equal(
          (
            await db.metaAdObject.findUniqueOrThrow({
              where: { id: objectIds[2] },
            })
          ).advisorId,
          second.id,
        );
      },
    );
    await t.test(
      "Display-only table renames preserve Meta alias/country links, assignment context and financial facts",
      async () => {
        const object = await db.metaAdObject.findFirstOrThrow({
          where: {
            accountId,
            aliasId: { not: null },
            aliasCountry: { not: null },
          },
        });
        const args = {
          tableId: table.id,
          country: object.aliasCountry!,
          aliasId: object.aliasId!,
        };
        const context = await metaAssignmentContext(actor, args);
        const links = await db.metaAdObject.findMany({
          where: { accountId },
          orderBy: { id: "asc" },
        });
        const days = await db.metaEffectivenessDay.findMany({
          where: { row: { alias: { tableId: table.id } } },
          orderBy: [{ rowId: "asc" }, { day: "asc" }],
        });
        const newName = "Uganda rename " + tag;
        await renameAliasTable(actor, table.id, newName);
        assert.equal(
          (await aliasTableOptions(actor)).find((t) => t.id === table.id)!.name,
          newName,
        );
        assert.deepEqual(
          await db.metaAdObject.findMany({
            where: { accountId },
            orderBy: { id: "asc" },
          }),
          links,
        );
        assert.deepEqual(
          await db.metaEffectivenessDay.findMany({
            where: { row: { alias: { tableId: table.id } } },
            orderBy: [{ rowId: "asc" }, { day: "asc" }],
          }),
          days,
        );
        assert.deepEqual(await metaAssignmentContext(actor, args), context);
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
    await db.metaAdvisorAssignment.deleteMany({
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
