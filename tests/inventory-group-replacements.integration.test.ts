import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../lib/db";
import {
  saveInventoryTrial,
  inventoryTrials,
} from "../lib/meta-ads/inventory-trials";
import type { TrialPayload } from "../lib/meta-ads/inventory-trial-policy";
import { groupUsageKey } from "../lib/meta-ads/inventory-group-usage";
test("Reemplazos entre grupos conservan usos, hojas y hechos", async (t) => {
  assert(
    process.env.DATABASE_URL?.includes("library_organization_test") &&
      process.env.DATABASE_URL.includes("/workspace/work/pgdata"),
    "QA only",
  );
  const tag = randomUUID(),
    owner = await db.user.create({
      data: {
        name: "QA reemplazos",
        email: tag + "@example.test",
        passwordHash: "synthetic",
        role: "OWNER",
        status: "APPROVED",
      },
    }),
    actor = { id: owner.id, role: owner.role },
    list = await db.metaEffectivenessSheet.create({
      data: { name: tag, kind: "INVENTORY" },
    });
  const tables = await Promise.all(
    ["PE", "BO"].map((defaultCountry) =>
      db.metaAliasTable.create({
        data: { name: tag + defaultCountry, defaultCountry },
      }),
    ),
  );
  const cats = await Promise.all(
    ["A", "B"].map((name) =>
      db.metaInventoryCategory.create({
        data: {
          sheetId: list.id,
          name,
          key: name.toLowerCase(),
          kind: "PRIMARY",
        },
      }),
    ),
  );
  const items = await Promise.all(
    ["A1", "B1", "A2", "B2", "A3"].map((name, index) =>
      db.metaInventoryItem.create({
        data: {
          sheetId: list.id,
          name: name + tag,
          categories: {
            create: { categoryId: cats[[0, 1, 0, 1, 0][index]].id },
          },
        },
      }),
    ),
  );
  const aliases = await Promise.all(
    items
      .slice(0, 4)
      .map((item, index) =>
        db.metaAlias.create({
          data: {
            name: item.name,
            inventorySheetId: list.id,
            tableId: tables[index % 2].id,
            effectivenessRows: {
              create: {
                country: tables[index % 2].defaultCountry,
                currency: "",
                displayCurrency: "PEN",
                days: {
                  create: {
                    day: "2026-11-03",
                    sales: index + 2,
                    fixedCost: "4.25",
                  },
                },
              },
            },
            effectivenessStates: {
              create: {
                country: tables[index % 2].defaultCountry,
                active: true,
                events: {
                  create: {
                    active: true,
                    actorId: actor.id,
                    createdAt: new Date(Date.now() - 13 * 3600000),
                    snapshot: { priorActive: false },
                  },
                },
              },
            },
          },
        }),
      ),
  );
  const create = (name: string, itemIds: string[], countries: string[]) =>
    saveInventoryTrial(actor, {
      action: "CREATE",
      listId: list.id,
      name,
      itemIds,
      countries,
      since: "2026-11-03",
      reserve: false,
      diverse: false,
      rules: { zero: 25, perSale: 50 },
    });
  try {
    const g1 = await create(
        "Grupo1",
        items.slice(0, 2).map((item) => item.id),
        ["PE"],
      ),
      g2 = await create(
        "Grupo2",
        items.slice(2, 4).map((item) => item.id),
        ["BO"],
      );
    assert("members" in g1 && g1.members && typeof g1.revision === "number");
    assert("members" in g2 && g2.members && typeof g2.revision === "number");
    const args = {
      action: "REPLACE_MEMBERS",
      listId: list.id,
      groupId: g1.id,
      groups: [
        { groupId: g1.id, revision: g1.revision },
        { groupId: g2.id, revision: g2.revision },
      ],
      pairs: [
        {
          itemId: items[0].id,
          replacementId: items[2].id,
          replacementGroupId: g2.id,
        },
        {
          itemId: items[1].id,
          replacementId: items[3].id,
          replacementGroupId: g2.id,
        },
      ],
      mode: "SAME",
      since: "2026-11-04",
    };
    const facts = () =>
      db.metaAlias.findMany({
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
      });
    const before = JSON.parse(JSON.stringify(await facts())),
      usage = (await inventoryTrials(actor, { listId: list.id })).usage;
    await t.test(
      "CAS de ambos grupos, membresía y duplicados bloquean sin cambios",
      async () => {
        await assert.rejects(
          () =>
            saveInventoryTrial(actor, {
              ...args,
              groups: [
                args.groups[0],
                { ...args.groups[1], revision: g2.revision + 1 },
              ],
            }),
          /cambió/,
        );
        await assert.rejects(
          () =>
            saveInventoryTrial(actor, {
              ...args,
              pairs: [args.pairs[0], args.pairs[0]],
            }),
          /repitas/,
        );
        await assert.rejects(
          () => saveInventoryTrial(actor, { ...args, mode: "OTHER" }),
          /categoría/,
        );
        await assert.rejects(
          () =>
            saveInventoryTrial(actor, {
              ...args,
              pairs: [
                { ...args.pairs[0], replacementGroupId: null },
                args.pairs[1],
              ],
            }),
          /Revisa|asignación|grupos/,
        );
        assert.deepEqual(
          (
            (
              await db.metaInventoryTrialGroup.findUniqueOrThrow({
                where: { id: g1.id },
              })
            ).payload as unknown as TrialPayload
          ).members,
          g1.members,
        );
      },
    );
    await t.test(
      "dos sustituciones de la misma categoría intercambian miembros de ambos grupos atómicamente",
      async () => {
        const next = await saveInventoryTrial(actor, args);
        assert("members" in next && next.members);
        assert.deepEqual(
          next.members.map((member) => member.itemId).sort(),
          items
            .slice(2, 4)
            .map((item) => item.id)
            .sort(),
        );
        const other = await db.metaInventoryTrialGroup.findUniqueOrThrow({
          where: { id: g2.id },
        });
        assert.deepEqual(
          (other.payload as unknown as TrialPayload).members
            .map((member) => member.itemId)
            .sort(),
          items
            .slice(0, 2)
            .map((item) => item.id)
            .sort(),
        );
      },
    );
    await t.test(
      "historial anterior y países de cada grupo se conservan",
      async () => {
        for (const [group, original] of [
          [g1, items.slice(0, 2)],
          [g2, items.slice(2, 4)],
        ] as const) {
          const row = await db.metaInventoryTrialGroup.findUniqueOrThrow({
            where: { id: group.id },
          });
          const payload = row.payload as unknown as TrialPayload;
          assert.equal(payload.cycles.length, 4);
          assert(
            payload.cycles
              .filter((c) => original.some((item) => item.id === c.itemId))
              .every((c) => c.until === "2026-11-03"),
          );
          assert.deepEqual(payload.countries, group.countries);
          assert(
            payload.cycles
              .slice(2)
              .every((c) => c.since === "2026-11-04" && c.until === null),
          );
        }
      },
    );
    await t.test(
      "uso por diplomado/país y hechos físicos no cambian al intercambiar grupos",
      async () => {
        assert.deepEqual(JSON.parse(JSON.stringify(await facts())), before);
        const next = (await inventoryTrials(actor, { listId: list.id })).usage;
        for (const item of items.slice(0, 4)) {
          const country = items.indexOf(item) % 2 ? "BO" : "PE";
          assert.equal(
            next[groupUsageKey(item.name, country)].automatic,
            usage[groupUsageKey(item.name, country)].automatic,
          );
          assert.equal(
            next[groupUsageKey(item.name, country)].automatic,
            "USED",
          );
        }
      },
    );
    await t.test(
      "sustituto sin grupo reemplaza solo en origen; el saliente conserva sus datos",
      async () => {
        const group = await db.metaInventoryTrialGroup.findUniqueOrThrow({
          where: { id: g1.id },
        });
        await saveInventoryTrial(actor, {
          action: "REPLACE_MEMBERS",
          listId: list.id,
          groupId: g1.id,
          groups: [{ groupId: g1.id, revision: group.revision }],
          pairs: [
            {
              itemId: items[2].id,
              replacementId: items[4].id,
              replacementGroupId: null,
            },
          ],
          mode: "ANY",
          since: "2026-11-04",
        });
        const payload = (
          await db.metaInventoryTrialGroup.findUniqueOrThrow({
            where: { id: g1.id },
          })
        ).payload as unknown as TrialPayload;
        assert(payload.members.some((m) => m.itemId === items[4].id));
        assert(!payload.members.some((m) => m.itemId === items[2].id));
        assert.deepEqual(JSON.parse(JSON.stringify(await facts())), before);
      },
    );
    await t.test(
      "reintento obsoleto no vuelve a intercambiar ni crea ciclos",
      async () => {
        const before = await db.metaInventoryTrialGroup.findMany({
          where: { sheetId: list.id },
          orderBy: { id: "asc" },
        });
        await assert.rejects(() => saveInventoryTrial(actor, args), /cambió/);
        assert.deepEqual(
          await db.metaInventoryTrialGroup.findMany({
            where: { sheetId: list.id },
            orderBy: { id: "asc" },
          }),
          before,
        );
      },
    );
  } finally {
    await db.metaEffectivenessRow.deleteMany({
      where: { aliasId: { in: aliases.map((alias) => alias.id) } },
    });
    await db.metaAlias.deleteMany({ where: { inventorySheetId: list.id } });
    await db.metaInventoryItem.deleteMany({ where: { sheetId: list.id } });
    await db.metaEffectivenessSheet.delete({ where: { id: list.id } });
    await db.metaAliasTable.deleteMany({
      where: { id: { in: tables.map((table) => table.id) } },
    });
    await db.auditEvent.deleteMany({ where: { actorId: actor.id } });
    await db.user.delete({ where: { id: owner.id } });
    await db.$disconnect();
  }
});
