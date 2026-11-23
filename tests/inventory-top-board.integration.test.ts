import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../lib/db";
import {
  inventoryActivationReport,
  inventoryActivationReplaceBatch,
} from "../lib/meta-ads/inventory-sheet-activation";

test(
  "Top countries retain actual interval ends and replacement changes only the selected country",
  {
    skip: process.env.RUN_TOP_BOARD_QA !== "1",
  },
  async () => {
    assert.equal(new URL(process.env.DATABASE_URL!).pathname, "/delivery_qa");
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      throw Error("External calls forbidden in board QA");
    };
    const tag = randomUUID(),
      owner = await db.user.create({
        data: {
          email: tag + "@example.invalid",
          name: "QA board",
          passwordHash: "synthetic",
          role: "OWNER",
          status: "APPROVED",
        },
      });
    const list = await db.metaEffectivenessSheet.create({
      data: { kind: "INVENTORY", name: tag },
    });
    const tables = await Promise.all(
      ["AR", "EC"].map((country) =>
        db.metaAliasTable.create({
          data: {
            name: tag + country,
            defaultCountry: country,
            defaultCurrency: "PEN",
          },
        }),
      ),
    );
    const names = [
      "Origin " + tag,
      "Candidate " + tag,
      "Closed " + tag,
      "Other " + tag,
    ];
    await db.metaInventoryItem.createMany({
      data: names.map((name) => ({ name, sheetId: list.id })),
    });
    const controls: Record<string, { pinned: boolean; campaignTask: string }> =
      {};
    try {
      for (const [i, table, country, active] of [
        [0, tables[0], "AR", true],
        [2, tables[0], "AR", false],
        [3, tables[1], "EC", true],
      ] as const) {
        const alias = await db.metaAlias.create({
          data: {
            tableId: table.id,
            name: names[i],
            inventorySheetId: list.id,
          },
        });
        const state = await db.metaEffectivenessState.create({
          data: { aliasId: alias.id, country, active, revision: 2 },
        });
        await db.metaEffectivenessEvent.create({
          data: {
            stateId: state.id,
            active: true,
            actorId: owner.id,
            createdAt: new Date("2026-11-01T15:00:00Z"),
            snapshot: {},
          },
        });
        if (!active)
          await db.metaEffectivenessEvent.create({
            data: {
              stateId: state.id,
              active: false,
              actorId: owner.id,
              createdAt: new Date("2026-11-10T16:00:00Z"),
              snapshot: {},
            },
          });
        const row = await db.metaEffectivenessRow.create({
          data: {
            aliasId: alias.id,
            country,
            currency: "PEN",
            displayCurrency: "PEN",
          },
        });
        await db.metaEffectivenessDay.create({
          data: {
            rowId: row.id,
            day: "2026-11-23",
            sales: country === "EC" ? 8 : 3,
            salesOverridden: true,
          },
        });
        controls[alias.id + "|" + country] = {
          pinned: true,
          campaignTask: "NONE",
        };
      }
      await db.metaEffectivenessSheet.update({
        where: { id: list.id },
        data: {
          config: {
            inventoryActivation: {
              sheets: tables.map((t) => t.id),
              countries: Object.fromEntries(
                tables.map((t) => [t.id, [t.defaultCountry]]),
              ),
              rows: controls,
            },
          },
        },
      });
      const report = () =>
        inventoryActivationReport(owner, {
          listId: list.id,
          tableIds: tables.map((t) => t.id).join(","),
          byCountry: "true",
          since: "2026-11-01",
          until: "2026-11-23",
        });
      const before = await report(),
        origin = before.rows.find((r) => r.name === names[0])!,
        closed = before.rows.find((r) => r.name === names[2])!;
      assert.equal(closed.activeUntil, "2026-11-10T16:00:00.000Z");
      assert.equal(origin.activeUntil, null);
      const otherState = await db.metaEffectivenessState.findMany({
        where: { alias: { tableId: tables[1].id } },
        include: { events: true },
        orderBy: { id: "asc" },
      });
      const otherRows = await db.metaEffectivenessRow.findMany({
        where: { alias: { tableId: tables[1].id } },
        include: { days: true },
        orderBy: { id: "asc" },
      });
      await inventoryActivationReplaceBatch(owner, {
        listId: list.id,
        tableId: tables[0].id,
        country: "AR",
        replacements: [
          {
            from: { name: names[0], targets: origin.targets },
            to: { name: names[1], targets: [] },
            mode: "MANUAL",
          },
        ],
      });
      const after = await report();
      assert.equal(
        after.rows.find((r) => r.name === names[0])!.campaignTask,
        "STOP",
      );
      assert.equal(
        after.rows.find((r) => r.name === names[1])!.campaignTask,
        "CREATE",
      );
      assert.deepEqual(
        await db.metaEffectivenessState.findMany({
          where: { alias: { tableId: tables[1].id } },
          include: { events: true },
          orderBy: { id: "asc" },
        }),
        otherState,
      );
      assert.deepEqual(
        await db.metaEffectivenessRow.findMany({
          where: { alias: { tableId: tables[1].id } },
          include: { days: true },
          orderBy: { id: "asc" },
        }),
        otherRows,
      );
      assert.equal(
        after.rows.find((r) => r.name === names[3])!.sales,
        before.rows.find((r) => r.name === names[3])!.sales,
      );
      assert.equal(
        await db.metaAlias.count({
          where: { tableId: tables[0].id, name: names[1] },
        }),
        1,
      );
    } finally {
      globalThis.fetch = originalFetch;
      await db.metaAlias.deleteMany({
        where: { tableId: { in: tables.map((t) => t.id) } },
      });
      await db.metaAliasTable.deleteMany({
        where: { id: { in: tables.map((t) => t.id) } },
      });
      await db.metaInventoryItem.deleteMany({ where: { sheetId: list.id } });
      await db.metaEffectivenessSheet.delete({ where: { id: list.id } });
      await db.auditEvent.deleteMany({ where: { actorId: owner.id } });
      await db.user.delete({ where: { id: owner.id } });
      await db.$disconnect();
    }
  },
);
