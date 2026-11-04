import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../lib/db";
import {
  inventoryTrials,
  saveInventoryTrial,
} from "../lib/meta-ads/inventory-trials";
import { groupUsageKey } from "../lib/meta-ads/inventory-group-usage";

test("Edit group country campaign metadata follows saved state/tasks, excludes foreign sheets and preserves manual usage independence", async () => {
  assert(
    process.env.DATABASE_URL?.includes("library_organization_test") &&
      process.env.DATABASE_URL.includes("/workspace/work/pgdata"),
    "exclusive QA database",
  );
  const tag = randomUUID(),
    owner = await db.user.create({
      data: {
        name: "Estado grupo QA",
        email: tag + "@example.test",
        passwordHash: "synthetic",
        role: "OWNER",
        status: "APPROVED",
      },
    }),
    actor = { id: owner.id, role: owner.role };
  const list = await db.metaEffectivenessSheet.create({
    data: { name: "Estados " + tag, kind: "INVENTORY" },
  });
  const tables = await Promise.all(
    [
      ["PERU", "PE"],
      ["ECUADOR", "EC"],
      ["BOLIVIA", "BO"],
    ].map(([name, defaultCountry]) =>
      db.metaAliasTable.create({ data: { name, defaultCountry } }),
    ),
  );
  const name = "Diplomado " + tag,
    item = await db.metaInventoryItem.create({
      data: { sheetId: list.id, name },
    });
  const pe = await db.metaAlias.create({
    data: {
      inventorySheetId: list.id,
      tableId: tables[0].id,
      name,
      effectivenessStates: {
        create: [
          { country: "PE", active: true },
          { country: "EC", active: true },
        ],
      },
      effectivenessRows: {
        create: {
          country: "EC",
          currency: "PEN",
          days: { create: { day: "2026-11-01", sales: 3 } },
        },
      },
    },
  });
  const ec = await db.metaAlias.create({
    data: {
      inventorySheetId: list.id,
      tableId: tables[1].id,
      name,
      effectivenessStates: { create: { country: "EC", active: false } },
      effectivenessRows: {
        create: { country: "EC", currency: "PEN", hidden: false },
      },
    },
  });
  const rowOnly = await db.metaAlias.create({
    data: {
      inventorySheetId: list.id,
      tableId: tables[1].id,
      name: "Fila " + tag,
      effectivenessRows: {
        create: { country: "EC", currency: "PEN", hidden: false },
      },
    },
  });
  const absent = await db.metaInventoryItem.create({
    data: { sheetId: list.id, name: "Solo inventario " + tag },
  });
  await db.metaAlias.create({
    data: {
      inventorySheetId: list.id,
      tableId: tables[1].id,
      name: absent.name,
    },
  });
  const facts = async () =>
    JSON.parse(
      JSON.stringify(
        await db.metaAlias.findMany({
          where: { inventorySheetId: list.id },
          orderBy: { id: "asc" },
          include: {
            effectivenessRows: {
              orderBy: { id: "asc" },
              include: { days: true },
            },
            effectivenessStates: {
              orderBy: { id: "asc" },
              include: { events: true },
            },
          },
        }),
      ),
    );
  async function tasks(
    peTask: "NONE" | "CREATE" | "STOP",
    ecTask: "NONE" | "CREATE" | "STOP",
  ) {
    const current = await db.metaEffectivenessSheet.findUniqueOrThrow({
      where: { id: list.id },
    });
    await db.metaEffectivenessSheet.update({
      where: { id: list.id },
      data: {
        config: {
          ...(current.config as object),
          inventoryActivation: {
            sheets: tables.map((t) => t.id),
            rows: {
              [pe.id + "|PE"]: { pinned: false, campaignTask: peTask },
              [ec.id + "|EC"]: { pinned: false, campaignTask: ecTask },
            },
          },
        },
      },
    });
  }
  try {
    await tasks("NONE", "NONE");
    const before = await facts();
    let directory = await inventoryTrials(actor, { listId: list.id });
    assert.equal(directory.campaignStates[groupUsageKey(name, "PE")], "ACTIVE");
    assert.equal(
      directory.campaignStates[groupUsageKey(name, "EC")],
      "INACTIVE",
    );
    assert.equal(
      directory.campaignStates[groupUsageKey(name, "BO")],
      undefined,
    );
    assert.equal(
      directory.campaignStates[groupUsageKey(absent.name, "EC")],
      undefined,
    );
    assert.equal(
      directory.campaignStates[groupUsageKey(rowOnly.name, "EC")],
      "ACTIVE",
    );
    assert.deepEqual(await facts(), before);
    await tasks("CREATE", "STOP");
    directory = await inventoryTrials(actor, { listId: list.id });
    assert.equal(directory.campaignStates[groupUsageKey(name, "PE")], "CREATE");
    assert.equal(directory.campaignStates[groupUsageKey(name, "EC")], "STOP");
    await saveInventoryTrial(actor, {
      action: "USAGE",
      listId: list.id,
      itemId: item.id,
      country: "PE",
      mode: "UNUSED",
      expectedRevision: null,
    });
    await saveInventoryTrial(actor, {
      action: "USAGE",
      listId: list.id,
      itemId: absent.id,
      country: "EC",
      mode: "USED",
      expectedRevision: null,
    });
    directory = await inventoryTrials(actor, { listId: list.id });
    assert.equal(directory.usage[groupUsageKey(name, "PE")].mode, "UNUSED");
    assert.equal(directory.campaignStates[groupUsageKey(name, "PE")], "CREATE");
    assert.equal(
      directory.usage[groupUsageKey(absent.name, "EC")].mode,
      "USED",
    );
    assert.equal(
      directory.campaignStates[groupUsageKey(absent.name, "EC")],
      undefined,
    );
    assert.deepEqual(await facts(), before);
    await tasks("NONE", "NONE");
    await db.metaEffectivenessState.update({
      where: { aliasId_country: { aliasId: pe.id, country: "PE" } },
      data: { active: false },
    });
    await db.metaEffectivenessRow.updateMany({
      where: { aliasId: rowOnly.id },
      data: { hidden: true },
    });
    directory = await inventoryTrials(actor, { listId: list.id });
    assert.equal(
      directory.campaignStates[groupUsageKey(name, "PE")],
      "INACTIVE",
    );
    assert.equal(
      directory.campaignStates[groupUsageKey(rowOnly.name, "EC")],
      "INACTIVE",
    );
    const extra = await db.metaAliasTable.create({
      data: { name: "Otra PE " + tag, defaultCountry: "PE" },
    });
    tables.push(extra);
    await db.metaAlias.create({
      data: {
        inventorySheetId: list.id,
        tableId: extra.id,
        name,
        effectivenessStates: { create: { country: "PE", active: true } },
      },
    });
    await tasks("NONE", "NONE");
    const mixedBefore = await facts();
    directory = await inventoryTrials(actor, { listId: list.id });
    assert.equal(directory.campaignStates[groupUsageKey(name, "PE")], "MIXED");
    assert.equal(
      directory.campaignStates[groupUsageKey(name, "EC")],
      "INACTIVE",
    );
    assert.deepEqual(await facts(), mixedBefore);
  } finally {
    await db.metaEffectivenessRow.deleteMany({
      where: { alias: { inventorySheetId: list.id } },
    });
    await db.metaAlias.deleteMany({ where: { inventorySheetId: list.id } });
    await db.metaInventoryItem.deleteMany({ where: { sheetId: list.id } });
    await db.metaAliasTable.deleteMany({
      where: { id: { in: tables.map((t) => t.id) } },
    });
    await db.metaEffectivenessSheet.delete({ where: { id: list.id } });
    await db.auditEvent.deleteMany({ where: { actorId: owner.id } });
    await db.user.delete({ where: { id: owner.id } });
  }
});
