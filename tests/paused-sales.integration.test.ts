import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../lib/db";
import { writeSyncPage } from "../lib/meta-ads/bulk-sync";
import { retainPausedSalesRows } from "../lib/meta-ads/paused-sales-retention";
import { inventoryTopSection } from "../lib/meta-ads/inventory-top-sections";
import { inventoryActivationPeriods } from "../lib/meta-ads/inventory-usage";
import {
  activationSettings,
  inventoryActivationReport,
} from "../lib/meta-ads/inventory-sheet-activation";
import {
  confirmCampaignInventoryStatus,
  setCampaignFlowTask,
} from "../lib/meta-ads/campaign-inventory-status";
import { effectiveness } from "../lib/meta-ads/effectiveness";

test("confirmed Meta pauses keep sales inactive, pinned and visible without changing money, countries or manual retirements", async () => {
  assert.match(process.env.DATABASE_URL ?? "", /localhost:55439\/delivery_qa/);
  const original = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => {
    requests++;
    throw Error("No Graph or FX requests in QA");
  };
  try {
    const actor = await db.user.create({
      data: {
        email: randomUUID() + "@example.invalid",
        name: "QA Meta retention",
        passwordHash: "no-login",
        role: "OWNER",
        status: "APPROVED",
      },
    });
    const table = await db.metaAliasTable.create({
      data: {
        name: "Ventas " + randomUUID(),
        defaultCountry: "PE",
        defaultCurrency: "PEN",
      },
    });
    const list = await db.metaEffectivenessSheet.create({
      data: {
        name: "Inventario " + randomUUID(),
        kind: "INVENTORY",
        config: {
          keep: "unchanged",
          inventoryActivation: {
            sheets: [table.id],
            countries: { [table.id]: ["PE", "CO"] },
            rows: {},
          },
        },
      },
    });
    const connection = await db.metaConnection.create({
      data: {
        ownerId: actor.id,
        name: "Synthetic",
        transport: "API",
        verifiedAt: new Date(),
      },
    });
    const accountId = String(Date.now());
    await db.metaAdAccount.create({
      data: {
        id: accountId,
        connectionId: connection.id,
        name: "QA",
        currency: "PEN",
        timezone: "America/Lima",
        enabled: true,
      },
    });
    const advisor = await db.metaAdvisor.create({
      data: { name: "QA asesor " + randomUUID() },
    });
    async function fixture(
      statuses: (string | null)[],
      extra: {
        task?: string;
        hidden?: boolean;
        active?: boolean;
        pinned?: boolean;
        currency?: string;
      } = {},
    ) {
      const alias = await db.metaAlias.create({
        data: {
          name: "Diplomado " + randomUUID(),
          tableId: table.id,
          inventorySheetId: list.id,
        },
      });
      await db.metaInventoryItem.create({
        data: { sheetId: list.id, name: alias.name },
      });
      const state = await db.metaEffectivenessState.create({
        data: {
          aliasId: alias.id,
          country: "PE",
          active: extra.active ?? true,
        },
      });
      const row = await db.metaEffectivenessRow.create({
        data: {
          aliasId: alias.id,
          country: "PE",
          currency: extra.currency ?? "PEN",
          displayCurrency: "PEN",
          advisorId: advisor.id,
          hidden: extra.hidden ?? false,
        },
      });
      const day = await db.metaEffectivenessDay.create({
        data: {
          rowId: row.id,
          day: "2026-11-10",
          sales: 7,
          fixedCost: 23,
          annotations: { G: 49 },
        },
      });
      const before = await db.metaEffectivenessSheet.findUniqueOrThrow({
        where: { id: list.id },
      });
      const settings = activationSettings(before.config);
      settings.rows[alias.id + "|PE"] = {
        pinned: extra.pinned ?? false,
        campaignTask: (extra.task ?? "NONE") as any,
      };
      if (extra.hidden) settings.detachedAliases.push(alias.id);
      await db.metaEffectivenessSheet.update({
        where: { id: list.id },
        data: {
          config: {
            ...(before.config as any),
            inventoryActivation: settings as any,
          },
        },
      });
      const ids: string[] = [];
      for (const status of statuses) {
        const id = randomUUID();
        ids.push(id);
        await db.metaAdObject.create({
          data: {
            id,
            accountId,
            name: "Campaña QA",
            level: "campaign",
            status,
            effectiveStatus: status,
            aliasId: alias.id,
            aliasCountry: "PE",
            seenAt: new Date(Date.now() - 120000),
          },
        });
      }
      return { alias, state, row, day, ids };
    }
    const controls = async () =>
      activationSettings(
        (
          await db.metaEffectivenessSheet.findUniqueOrThrow({
            where: { id: list.id },
          })
        ).config,
      );
    async function batch(
      ids: string[],
      at = new Date(),
      missing: string[] = [],
      status: "ACTIVE" | "PAUSED" = "PAUSED",
    ) {
      return db.$transaction(async (tx) => {
        await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(884411)");
        await writeSyncPage(
          tx,
          ids.map((id) => ({
            id,
            accountId,
            name: "Campaña QA",
            level: "campaign",
            status,
            effectiveStatus: status,
          })),
          [],
          true,
          at,
        );
        if (missing.length)
          await tx.metaAdObject.updateMany({
            where: { id: { in: missing } },
            data: { status: null, effectiveStatus: "UNAVAILABLE", seenAt: at },
          });
        return retainPausedSalesRows(tx, ids, at);
      });
    }
    const a = await fixture(["ACTIVE", "ACTIVE"]);
    await db.metaEffectivenessState.create({
      data: { aliasId: a.alias.id, country: "CO", active: true },
    });
    const colombia = await db.metaEffectivenessRow.create({
      data: {
        aliasId: a.alias.id,
        country: "CO",
        currency: "PEN",
        displayCurrency: "PEN",
      },
    });
    await db.metaAdObject.create({
      data: {
        id: randomUUID(),
        accountId,
        name: "Colombia",
        level: "campaign",
        status: "ACTIVE",
        aliasId: a.alias.id,
        aliasCountry: "CO",
      },
    });
    assert.equal(await batch([a.ids[0]]), 0);
    assert.equal(
      (
        await db.metaEffectivenessState.findUniqueOrThrow({
          where: { id: a.state.id },
        })
      ).active,
      true,
    );
    assert.equal(await batch([a.ids[1]]), 1);
    assert.equal(
      (
        await db.metaEffectivenessState.findUniqueOrThrow({
          where: { id: a.state.id },
        })
      ).active,
      false,
    );
    assert.equal((await controls()).rows[a.alias.id + "|PE"].pinned, true);
    const kept = await db.metaEffectivenessRow.findUniqueOrThrow({
      where: { id: a.row.id },
    });
    assert.equal(kept.hidden, false);
    assert.equal(kept.advisorId, advisor.id);
    assert.equal(kept.displayCurrency, "PEN");
    assert.equal(
      await db.metaEffectivenessRow.count({
        where: { aliasId: a.alias.id, country: "PE" },
      }),
      1,
    );
    assert.deepEqual(
      await db.metaEffectivenessDay.findUniqueOrThrow({
        where: { rowId_day: { rowId: a.row.id, day: a.day.day } },
      }),
      a.day,
    );
    assert.equal(
      (
        await db.metaEffectivenessState.findUniqueOrThrow({
          where: { aliasId_country: { aliasId: a.alias.id, country: "CO" } },
        })
      ).active,
      true,
    );
    assert.equal(
      (
        await db.metaEffectivenessRow.findUniqueOrThrow({
          where: { id: colombia.id },
        })
      ).hidden,
      false,
    );
    assert.equal(await batch([a.ids[1]]), 0);
    assert.equal(
      await db.metaEffectivenessEvent.count({ where: { stateId: a.state.id } }),
      1,
    );
    const report = await effectiveness(
      actor,
      table.id,
      "2026-11-10",
      "2026-11-10",
    );
    const visible = report.rows.find(
      (r) => r.aliasId === a.alias.id && r.country === "PE",
    );
    assert(visible);
    assert.equal(visible.active, false);
    assert.equal(visible.pinned, true);

    const unknown = await fixture(["ACTIVE", null]);
    assert.equal(await batch([unknown.ids[0]]), 0);
    const missing = await fixture(["ACTIVE", "PAUSED"]);
    assert.equal(
      await batch([missing.ids[0]], new Date(), [missing.ids[1]]),
      0,
    );
    const stale = await fixture(["ACTIVE"]);
    const oldRead = new Date(Date.now() - 3600000);
    assert.equal(await batch(stale.ids, oldRead), 0);
    assert.equal(
      (await db.metaAdObject.findUniqueOrThrow({ where: { id: stale.ids[0] } }))
        .status,
      "ACTIVE",
    );
    const recentManual = await fixture(["ACTIVE"]);
    const reading = new Date(Date.now() - 1000);
    await db.metaEffectivenessEvent.create({
      data: {
        stateId: recentManual.state.id,
        actorId: actor.id,
        active: true,
        createdAt: new Date(),
        snapshot: { source: "MANUAL" },
      },
    });
    assert.equal(await batch(recentManual.ids, reading), 0);
    const pending = await fixture(["PAUSED"], { task: "CREATE" });
    assert.equal(await batch(pending.ids), 1);
    assert.equal(
      (await controls()).rows[pending.alias.id + "|PE"].campaignTask,
      "CREATE",
    );
    const retired = await fixture(["PAUSED"], { hidden: true });
    assert.equal(await batch(retired.ids), 0);
    assert.equal(
      (
        await db.metaEffectivenessRow.findUniqueOrThrow({
          where: { id: retired.row.id },
        })
      ).hidden,
      true,
    );
    const manuallyOff = await fixture(["PAUSED"], { active: false });
    assert.equal(await batch(manuallyOff.ids), 0);
    assert.equal(
      (await controls()).rows[manuallyOff.alias.id + "|PE"].pinned,
      false,
    );

    const manual = await fixture(["PAUSED"], { currency: "", task: "STOP" });
    await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(884411)");
      await confirmCampaignInventoryStatus(
        tx,
        {
          authorized: actor,
          scope: {
            listId: list.id,
            tableId: table.id,
            aliasId: manual.alias.id,
            country: "PE",
            name: manual.alias.name,
          },
          revision: manual.state.revision,
        } as any,
        "PAUSED",
      );
    });
    assert.equal((await controls()).rows[manual.alias.id + "|PE"].pinned, true);
    assert.equal(
      (await controls()).rows[manual.alias.id + "|PE"].campaignTask,
      "NONE",
    );
    assert.equal(
      (
        await db.metaEffectivenessRow.findUniqueOrThrow({
          where: { id: manual.row.id },
        })
      ).hidden,
      false,
    );
    assert.equal(
      (
        await db.metaEffectivenessState.findUniqueOrThrow({
          where: { id: manual.state.id },
        })
      ).active,
      false,
    );
    for (const task of ["CREATE", "FLOW", "STOP", "SYNC"]) {
      const item = await fixture(["PAUSED"], { active: false, task });
      assert.equal(await batch(item.ids, new Date(), [], "ACTIVE"), 1);
      assert.equal(
        (
          await db.metaEffectivenessState.findUniqueOrThrow({
            where: { id: item.state.id },
          })
        ).active,
        true,
      );
      assert.equal(
        (await controls()).rows[item.alias.id + "|PE"].campaignTask,
        task,
      );
      assert.equal(await batch(item.ids), 1);
      assert.equal(
        (
          await db.metaEffectivenessState.findUniqueOrThrow({
            where: { id: item.state.id },
          })
        ).active,
        false,
      );
      assert.equal(
        (await controls()).rows[item.alias.id + "|PE"].campaignTask,
        task === "STOP" ? "NONE" : task,
      );
      await db.$transaction(async (tx) => {
        await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(884411)");
        await confirmCampaignInventoryStatus(
          tx,
          {
            authorized: actor,
            scope: {
              listId: list.id,
              tableId: table.id,
              aliasId: item.alias.id,
              country: "PE",
              name: item.alias.name,
            },
            revision: 0,
          } as any,
          "ACTIVE",
        );
      });
      assert.equal(
        (
          await db.metaEffectivenessState.findUniqueOrThrow({
            where: { id: item.state.id },
          })
        ).active,
        true,
      );
      assert.equal(
        (await controls()).rows[item.alias.id + "|PE"].campaignTask,
        task === "STOP" ? "NONE" : task,
      );
      assert.equal(
        (
          await db.metaEffectivenessRow.findUniqueOrThrow({
            where: { id: item.row.id },
          })
        ).hidden,
        false,
      );
    }
    // Existing rows already paused by the old synchronizer still need STOP completed.
    const stopped = await fixture(["PAUSED"], {
      active: false,
      pinned: true,
      task: "STOP",
    });
    await db.metaEffectivenessEvent.createMany({
      data: [
        {
          stateId: stopped.state.id,
          actorId: actor.id,
          active: true,
          createdAt: new Date("2026-11-01T15:00:00Z"),
          snapshot: { priorActive: false },
        },
        {
          stateId: stopped.state.id,
          actorId: actor.id,
          active: false,
          createdAt: new Date("2026-11-10T15:00:00Z"),
          snapshot: { priorActive: true },
        },
      ],
    });
    const history = () =>
      db.metaEffectivenessEvent.findMany({
        where: { stateId: stopped.state.id },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      });
    const periodsBefore = inventoryActivationPeriods(await history(), false);
    assert.equal(await batch(stopped.ids), 1);
    assert.equal(
      (await controls()).rows[stopped.alias.id + "|PE"].campaignTask,
      "NONE",
    );
    assert.equal(
      (await controls()).rows[stopped.alias.id + "|PE"].pinned,
      true,
    );
    assert.deepEqual(
      inventoryActivationPeriods(await history(), false),
      periodsBefore,
    );
    assert.equal(await batch(stopped.ids), 0);
    assert.deepEqual(
      await db.metaEffectivenessDay.findUniqueOrThrow({
        where: { rowId_day: { rowId: stopped.row.id, day: stopped.day.day } },
      }),
      stopped.day,
    );
    const stoppedSales = (
      await effectiveness(actor, table.id, "2026-11-10", "2026-11-10")
    ).rows.find((r) => r.aliasId === stopped.alias.id && r.country === "PE");
    assert(stoppedSales);
    assert.equal(stoppedSales.active, false);
    assert.equal(stoppedSales.pinned, true);
    assert.equal(stoppedSales.campaignTask, "NONE");
    const inventory = await inventoryActivationReport(actor, {
      listId: list.id,
      tableIds: table.id,
      byCountry: "true",
      since: "2026-11-10",
      until: "2026-11-10",
    });
    const stoppedInventory = inventory.rows.find(
      (r) => r.name === stopped.alias.name && r.country === "PE",
    );
    assert(stoppedInventory);
    assert.equal(stoppedInventory.activation, "INACTIVE");
    assert.equal(stoppedInventory.campaignTask, "NONE");
    assert.equal(inventoryTopSection(stoppedInventory), "inactive");
    const retiredStop = await fixture(["PAUSED"], {
      active: false,
      pinned: false,
      task: "STOP",
    });
    assert.equal(await batch(retiredStop.ids), 0);
    assert.equal(
      (await controls()).rows[retiredStop.alias.id + "|PE"].pinned,
      false,
    );
    const unknownStop = await fixture(["ACTIVE", null], { task: "STOP" });
    assert.equal(await batch([unknownStop.ids[0]]), 0);
    assert.equal(
      (await controls()).rows[unknownStop.alias.id + "|PE"].campaignTask,
      "STOP",
    );

    // A manual pause must wait for the other linked campaigns as well.
    const multiple = await fixture(["PAUSED", "ACTIVE"], {
      task: "STOP",
      currency: "",
    });
    const confirmMultiple = () =>
      db.$transaction(async (tx) => {
        await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(884411)");
        return confirmCampaignInventoryStatus(
          tx,
          {
            authorized: actor,
            scope: {
              listId: list.id,
              tableId: table.id,
              aliasId: multiple.alias.id,
              country: "PE",
              name: multiple.alias.name,
            },
            revision: 0,
          } as any,
          "PAUSED",
        );
      });
    assert.deepEqual(await confirmMultiple(), {
      inventoryActive: true,
      inventoryCampaignTask: "STOP",
    });
    await db.metaAdObject.update({
      where: { id: multiple.ids[1] },
      data: { status: "PAUSED" },
    });
    assert.deepEqual(await confirmMultiple(), {
      inventoryActive: false,
      inventoryCampaignTask: "NONE",
    });
    assert.equal(
      (await controls()).rows[multiple.alias.id + "|PE"].pinned,
      true,
    );

    const flowItem = await fixture(["ACTIVE"]);
    await setCampaignFlowTask(actor, flowItem.ids[0], "NONE", true);
    assert.equal(
      (await controls()).rows[flowItem.alias.id + "|PE"].campaignTask,
      "FLOW",
    );
    assert.equal(
      (
        await db.metaAdObject.findUniqueOrThrow({
          where: { id: flowItem.ids[0] },
        })
      ).status,
      "ACTIVE",
    );
    await assert.rejects(
      setCampaignFlowTask(actor, flowItem.ids[0], "NONE", false),
      /pendiente cambió/,
    );
    await setCampaignFlowTask(actor, flowItem.ids[0], "FLOW", false);
    assert.equal(
      (await controls()).rows[flowItem.alias.id + "|PE"].campaignTask,
      "NONE",
    );
    const revoked = await fixture(["ACTIVE"]);
    await db.user.update({
      where: { id: actor.id },
      data: { status: "SUSPENDED" },
    });
    assert.equal(await batch(revoked.ids), 0);
    assert.equal(
      (
        await db.metaEffectivenessState.findUniqueOrThrow({
          where: { id: revoked.state.id },
        })
      ).active,
      true,
    );
    assert.equal(requests, 0);
  } finally {
    globalThis.fetch = original;
    await db.$disconnect();
  }
});
