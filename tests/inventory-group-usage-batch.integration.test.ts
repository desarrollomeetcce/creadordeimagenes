import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../lib/db";
import {
  inventoryTrials,
  saveInventoryTrial,
} from "../lib/meta-ads/inventory-trials";
import { groupUsageKey } from "../lib/meta-ads/inventory-group-usage";
import { usageBatchRevision } from "../lib/meta-ads/inventory-group-usage-batch-policy";

test("bulk manual usage is scoped, atomic, revision-checked and independent of group cycles and operational state", async () => {
  assert(
    process.env.DATABASE_URL?.includes("library_organization_test") &&
      process.env.DATABASE_URL.includes("/workspace/work/pgdata"),
    "exclusive QA database",
  );
  const tag = randomUUID(),
    owner = await db.user.create({
      data: {
        name: "Lote QA",
        email: tag + "@example.test",
        passwordHash: "synthetic",
        role: "OWNER",
        status: "APPROVED",
      },
    }),
    actor = { id: owner.id, role: owner.role };
  const list = await db.metaEffectivenessSheet.create({
      data: { name: "Lote " + tag, kind: "INVENTORY" },
    }),
    foreign = await db.metaEffectivenessSheet.create({
      data: { name: "Ajeno " + tag, kind: "INVENTORY" },
    });
  const tables = await Promise.all(
    ["PE", "EC"].map((defaultCountry) =>
      db.metaAliasTable.create({
        data: { name: defaultCountry + " " + tag, defaultCountry },
      }),
    ),
  );
  const items = await Promise.all(
      ["A", "B"].map((name) =>
        db.metaInventoryItem.create({
          data: { sheetId: list.id, name: name + " " + tag },
        }),
      ),
    ),
    outside = await db.metaInventoryItem.create({
      data: { sheetId: foreign.id, name: "Ajeno " + tag },
    });
  for (let i = 0; i < 2; i++)
    await db.metaAlias.create({
      data: {
        inventorySheetId: list.id,
        tableId: tables[i].id,
        name: items[i].name,
        effectivenessStates: {
          create: {
            country: i === 0 ? "PE" : "EC",
            active: i === 0,
            events: {
              create: {
                active: i === 0,
                actorId: owner.id,
                snapshot: { priorActive: i !== 0 },
              },
            },
          },
        },
        effectivenessRows: {
          create: {
            country: i === 0 ? "PE" : "EC",
            currency: "PEN",
            days: {
              create: { day: "2026-11-01", sales: i + 1, fixedCost: "2.5" },
            },
          },
        },
      },
    });
  await db.metaEffectivenessSheet.update({
    where: { id: list.id },
    data: {
      config: { inventoryActivation: { sheets: tables.map((t) => t.id) } },
    },
  });
  const group = await saveInventoryTrial(actor, {
    action: "CREATE",
    listId: list.id,
    name: "Grupo QA",
    itemIds: items.map((i) => i.id),
    countries: ["PE", "EC"],
    since: new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Lima",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date()),
    reserve: false,
    diverse: false,
    rules: { zero: 25, perSale: 50 },
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
  const read = () => inventoryTrials(actor, { listId: list.id });
  try {
    const before = await facts(),
      original = await db.metaInventoryTrialGroup.findUniqueOrThrow({
        where: { id: group.id },
      }),
      initial = await read();
    const args = {
      action: "USAGE_BATCH",
      listId: list.id,
      itemIds: items.map((i) => i.id),
      countries: ["PE", "EC"],
      mode: "USED",
      expectedUsageRevision: await usageBatchRevision(
        items,
        ["PE", "EC"],
        initial.usage,
      ),
    };
    const result = await saveInventoryTrial(actor, args);
    assert("usageBatchUpdate" in result && result.usageBatchUpdate);
    assert.equal(result.usageBatchUpdate.cells, 4);
    let directory = await read();
    for (const item of items)
      for (const code of ["PE", "EC"]) {
        assert.equal(
          directory.usage[groupUsageKey(item.name, code)].mode,
          "USED",
        );
        assert.equal(
          directory.usage[groupUsageKey(item.name, code)].revision,
          result.usageBatchUpdate.revision,
        );
      }
    const saved = (
      await db.metaEffectivenessSheet.findUniqueOrThrow({
        where: { id: list.id },
      })
    ).config;
    await assert.rejects(
      saveInventoryTrial(actor, { ...args, mode: "UNUSED" }),
      /El uso cambió/,
    );
    assert.deepEqual(
      (
        await db.metaEffectivenessSheet.findUniqueOrThrow({
          where: { id: list.id },
        })
      ).config,
      saved,
    );
    await assert.rejects(
      saveInventoryTrial(actor, {
        ...args,
        itemIds: [items[0].id, items[0].id],
      }),
      /No repitas/,
    );
    await assert.rejects(
      saveInventoryTrial(actor, { ...args, countries: ["PE", "PE"] }),
      /No repitas/,
    );
    await assert.rejects(
      saveInventoryTrial(actor, { ...args, countries: ["BO"] }),
      /país/,
    );
    await assert.rejects(
      saveInventoryTrial(actor, { ...args, itemIds: [outside.id] }),
      /ya no está disponible/,
    );
    await assert.rejects(
      saveInventoryTrial({ id: owner.id, role: "OBSERVER" }, args),
    );
    const scoped = await usageBatchRevision(
        [items[1]],
        ["EC"],
        directory.usage,
      ),
      bothPE = await usageBatchRevision(items, ["PE"], directory.usage);
    await saveInventoryTrial(actor, {
      action: "USAGE",
      listId: list.id,
      itemId: items[0].id,
      country: "PE",
      mode: "UNUSED",
      expectedRevision:
        directory.usage[groupUsageKey(items[0].name, "PE")].revision,
    });
    await assert.rejects(
      saveInventoryTrial(actor, {
        ...args,
        countries: ["PE"],
        mode: "UNUSED",
        expectedUsageRevision: bothPE,
      }),
      /El uso cambió/,
    );
    directory = await read();
    assert.equal(
      directory.usage[groupUsageKey(items[1].name, "PE")].mode,
      "USED",
    );
    await saveInventoryTrial(actor, {
      ...args,
      itemIds: [items[1].id],
      countries: ["EC"],
      mode: "UNUSED",
      expectedUsageRevision: scoped,
    });
    directory = await read();
    assert.equal(
      directory.usage[groupUsageKey(items[1].name, "EC")].mode,
      "UNUSED",
    );
    assert.equal(
      directory.usage[groupUsageKey(items[0].name, "EC")].mode,
      "USED",
    );
    assert.deepEqual(await facts(), before);
    assert.deepEqual(
      await db.metaInventoryTrialGroup.findUniqueOrThrow({
        where: { id: group.id },
      }),
      original,
    );
    assert.deepEqual(directory.campaignStates, initial.campaignStates);
    assert.equal(
      await db.auditEvent.count({
        where: { actorId: owner.id, action: "INVENTARIO_USO_MANUAL_LOTE" },
      }),
      2,
    );
  } finally {
    await db.metaInventoryTrialGroup.deleteMany({
      where: { sheetId: list.id },
    });
    await db.metaEffectivenessRow.deleteMany({
      where: { alias: { inventorySheetId: list.id } },
    });
    await db.metaAlias.deleteMany({ where: { inventorySheetId: list.id } });
    await db.metaInventoryItem.deleteMany({
      where: { sheetId: { in: [list.id, foreign.id] } },
    });
    await db.metaAliasTable.deleteMany({
      where: { id: { in: tables.map((t) => t.id) } },
    });
    await db.metaEffectivenessSheet.deleteMany({
      where: { id: { in: [list.id, foreign.id] } },
    });
    await db.auditEvent.deleteMany({ where: { actorId: owner.id } });
    await db.user.delete({ where: { id: owner.id } });
  }
});
