import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../lib/db";
import {
  previewInventoryUnification,
  unifyInventoryDiplomas,
} from "../lib/meta-ads/inventory-unification";
import {
  inventoryTrials,
  saveInventoryTrial,
} from "../lib/meta-ads/inventory-trials";
import { groupUsageKey } from "../lib/meta-ads/inventory-group-usage";
import type { TrialPayload } from "../lib/meta-ads/inventory-trial-policy";

test("Unificación conserva hojas, países, hechos, asignaciones y vínculos", async (t) => {
  assert(
    process.env.DATABASE_URL?.includes("library_organization_test") &&
      process.env.DATABASE_URL.includes("/workspace/work/pgdata"),
    "Solo DB QA",
  );
  const tag = randomUUID();
  const owner = await db.user.create({
    data: {
      name: "QA unificación",
      email: tag + "@example.test",
      passwordHash: "synthetic",
      role: "OWNER",
      status: "APPROVED",
    },
  });
  const actor = { id: owner.id, role: owner.role };
  const list = await db.metaEffectivenessSheet.create({
    data: { name: tag, kind: "INVENTORY" },
  });
  const tables = await Promise.all(
    ["PE", "BO", "HN"].map((defaultCountry) =>
      db.metaAliasTable.create({
        data: { name: tag + defaultCountry, defaultCountry },
      }),
    ),
  );
  const names = [
    "Metodología para el aprendizaje lecto-escritura " + tag,
    "LECTOESCRITUA " + tag,
    "LECTOESCRITURA " + tag,
  ];
  const category = await db.metaInventoryCategory.create({
    data: {
      sheetId: list.id,
      name: "Educación",
      key: "educacion",
      kind: "PRIMARY",
    },
  });
  const items = await Promise.all(
    names.map((name, index) =>
      db.metaInventoryItem.create({
        data: {
          sheetId: list.id,
          name,
          ...(index === 0
            ? { categories: { create: { categoryId: category.id } } }
            : {}),
        },
      }),
    ),
  );
  const aliases = await Promise.all(
    names.map((name, index) =>
      db.metaAlias.create({
        data: { name, tableId: tables[index].id, inventorySheetId: list.id },
      }),
    ),
  );
  const rows = await Promise.all(
    aliases.map((alias, index) =>
      db.metaEffectivenessRow.create({
        data: {
          aliasId: alias.id,
          country: tables[index].defaultCountry,
          currency: "",
          displayCurrency: "PEN",
          days: {
            create: {
              day: "2026-11-03",
              sales: index + 2,
              fixedCost: "7.25",
              annotations: { qa: tag },
            },
          },
        },
      }),
    ),
  );
  await Promise.all(
    aliases.map((alias, index) =>
      db.metaEffectivenessState.create({
        data: {
          aliasId: alias.id,
          country: tables[index].defaultCountry,
          active: true,
          events: {
            create: {
              actorId: actor.id,
              active: true,
              createdAt: new Date(Date.now() - 13 * 3600000),
              snapshot: { priorActive: false },
            },
          },
        },
      }),
    ),
  );
  const conn = await db.metaConnection.create({
    data: { ownerId: owner.id, name: tag, transport: "API" },
  });
  const account = await db.metaAdAccount.create({
    data: {
      id: tag,
      connectionId: conn.id,
      name: tag,
      currency: "PEN",
      timezone: "America/Lima",
      enabled: false,
    },
  });
  const object = await db.metaAdObject.create({
    data: {
      id: tag + "campaign",
      accountId: account.id,
      level: "campaign",
      name: "LECTOESCRITUA BO",
      aliasId: aliases[1].id,
      aliasCountry: "BO",
      status: "ACTIVE",
    },
  });
  await db.metaAdDaily.create({
    data: {
      accountId: account.id,
      objectId: object.id,
      day: "2026-11-03",
      spend: "35.45",
    },
  });
  const selection = {
    listId: list.id,
    sourceIds: items.slice(1).map((item) => item.id),
    targetId: items[0].id,
  };
  const snapshot = async () =>
    JSON.parse(
      JSON.stringify(
        await db.metaAlias.findMany({
          where: { id: { in: aliases.map((a) => a.id) } },
          orderBy: { id: "asc" },
          select: {
            id: true,
            tableId: true,
            effectivenessRows: {
              orderBy: { id: "asc" },
              include: {
                days: { orderBy: { day: "asc" } },
                salesApprovals: true,
              },
            },
            effectivenessStates: {
              orderBy: { id: "asc" },
              include: { events: { orderBy: { id: "asc" } } },
            },
            advisorAssignments: true,
            supports: true,
            objects: { orderBy: { id: "asc" }, include: { daily: true } },
          },
        }),
      ),
    );
  try {
    await t.test(
      "preview es solo lectura y conserva destinos originales PE/BO/HN",
      async () => {
        const p = await previewInventoryUnification(actor, selection);
        assert.equal(p.ready, true);
        assert.deepEqual(p.sheets.flatMap((s) => s.countries).sort(), [
          "BO",
          "HN",
        ]);
        assert.equal(
          p.sheets.reduce((n, s) => n + s.campaigns, 0),
          1,
        );
        assert.equal(
          await db.metaInventoryItem.count({ where: { sheetId: list.id } }),
          3,
        );
      },
    );
    await t.test(
      "cambio concurrente de ventas rechaza todo sin renombrar",
      async () => {
        const p = await previewInventoryUnification(actor, selection);
        await db.metaEffectivenessDay.update({
          where: { rowId_day: { rowId: rows[1].id, day: "2026-11-03" } },
          data: { sales: 11 },
        });
        await assert.rejects(
          () =>
            unifyInventoryDiplomas(actor, {
              ...selection,
              token: p.token,
              requestId: randomUUID(),
            }),
          /cambiaron/,
        );
        assert.equal(
          (
            await db.metaAlias.findUniqueOrThrow({
              where: { id: aliases[1].id },
            })
          ).name,
          names[1],
        );
      },
    );
    await t.test(
      "una asociación nueva invalida preview sin alteraciones parciales",
      async () => {
        const p = await previewInventoryUnification(actor, selection);
        const extra = await db.metaAlias.create({
          data: {
            inventorySheetId: list.id,
            tableId: tables[0].id,
            name: names[1],
          },
        });
        try {
          await assert.rejects(
            () =>
              unifyInventoryDiplomas(actor, {
                ...selection,
                token: p.token,
                requestId: randomUUID(),
              }),
            /cambiaron/,
          );
          const fresh = await previewInventoryUnification(actor, selection);
          assert.equal(fresh.ready, false);
          assert(fresh.reasons.some((r) => r.includes("conciliación")));
        } finally {
          await db.metaAlias.delete({ where: { id: extra.id } });
        }
      },
    );
    await t.test("marcas manuales contradictorias se bloquean", async () => {
      await db.metaEffectivenessSheet.update({
        where: { id: list.id },
        data: {
          config: {
            inventoryGroupUsage: {
              [groupUsageKey(names[0], "BO")]: {
                mode: "UNUSED",
                revision: "x",
              },
              [groupUsageKey(names[1], "BO")]: { mode: "USED", revision: "y" },
            },
          },
        },
      });
      const p = await previewInventoryUnification(actor, selection);
      assert.equal(p.ready, false);
      assert(p.reasons.some((r) => r.includes("manuales")));
      await db.metaEffectivenessSheet.update({
        where: { id: list.id },
        data: {
          config: {
            inventoryActivation: { sheets: tables.map((t) => t.id) },
            inventoryGroupUsage: {
              [groupUsageKey(names[2], "HN")]: {
                mode: "USED",
                revision: "manual-hn",
              },
            },
          },
        },
      });
    });
    const group = await saveInventoryTrial(actor, {
      action: "CREATE",
      listId: list.id,
      name: "Afiches QA",
      itemIds: [items[1].id],
      countries: ["BO"],
      since: "2026-11-03",
      reserve: false,
      diverse: false,
      rules: { zero: 25, perSale: 50 },
    });
    assert("members" in group);
    const groupId = group.id;
    const oldGroup = await db.metaInventoryTrialGroup.findUniqueOrThrow({
      where: { id: groupId },
    });
    await t.test(
      "otros inventarios y roles sin OWNER no pueden unificar",
      async () => {
        const foreign = await db.metaEffectivenessSheet.create({
          data: { name: tag + "foreign", kind: "INVENTORY" },
        });
        try {
          await assert.rejects(
            () =>
              previewInventoryUnification(actor, {
                ...selection,
                listId: foreign.id,
              }),
            /no pertenece/,
          );
        } finally {
          await db.metaEffectivenessSheet.delete({ where: { id: foreign.id } });
        }
        await db.user.update({
          where: { id: actor.id },
          data: { role: "USER" },
        });
        try {
          await assert.rejects(() =>
            previewInventoryUnification(actor, selection),
          );
        } finally {
          await db.user.update({
            where: { id: actor.id },
            data: { role: "OWNER" },
          });
        }
      },
    );
    const before = await snapshot();
    const p = await previewInventoryUnification(actor, selection);
    assert.equal(p.ready, true);
    const request = { ...selection, token: p.token, requestId: randomUUID() };
    let result: Awaited<ReturnType<typeof unifyInventoryDiplomas>>;
    await t.test(
      "unifica con oficial manteniendo exactamente IDs, hojas, países, ventas, gasto e historial",
      async () => {
        result = await unifyInventoryDiplomas(actor, request);
        assert.equal(result.targetId, items[0].id);
        assert.deepEqual(await snapshot(), before);
        assert.equal(
          await db.metaInventoryItem.count({ where: { sheetId: list.id } }),
          1,
        );
        const after = await db.metaAlias.findMany({
          where: { inventorySheetId: list.id },
          include: { categoryAssignments: true },
        });
        assert(
          after.every(
            (a) =>
              a.name === names[0] &&
              a.categoryAssignments.some((c) => c.categoryId === category.id),
          ),
        );
        const directory = await inventoryTrials(actor, { listId: list.id });
        assert.equal(directory.catalog.length, 1);
        for (const code of ["PE", "BO", "HN"])
          assert.equal(
            directory.usage[groupUsageKey(names[0], code)].automatic,
            "USED",
          );
        assert.equal(
          directory.usage[groupUsageKey(names[0], "HN")].mode,
          "USED",
        );
      },
    );
    await t.test(
      "grupo y ciclos siguen al oficial conservando slot, fechas y auditoría anterior",
      async () => {
        const g = await db.metaInventoryTrialGroup.findUniqueOrThrow({
          where: { id: groupId },
        });
        const old = oldGroup.payload as unknown as TrialPayload;
        const next = g.payload as unknown as TrialPayload;
        assert.equal(next.members[0].slotId, old.members[0].slotId);
        assert.equal(next.members[0].itemId, items[0].id);
        assert.equal(next.cycles[0].id, old.cycles[0].id);
        assert.equal(next.cycles[0].since, old.cycles[0].since);
        assert.equal(next.cycles[0].name, names[0]);
        const event = await db.auditEvent.findFirstOrThrow({
          where: { actorId: actor.id, action: "META_INVENTARIO_UNIFICADO" },
        });
        const detail = event.detail as any;
        assert.deepEqual(detail.groups[0].before, oldGroup.payload);
      },
    );
    await t.test(
      "reintento devuelve recibo sin otra escritura; requestId diferente contenido se rechaza",
      async () => {
        const prior = await db.metaEffectivenessSheet.findUniqueOrThrow({
          where: { id: list.id },
        });
        const retry = await unifyInventoryDiplomas(actor, request);
        assert.equal(retry.targetId, items[0].id);
        const after = await db.metaEffectivenessSheet.findUniqueOrThrow({
          where: { id: list.id },
        });
        assert.equal(prior.revision, after.revision);
        assert.equal(
          await db.auditEvent.count({
            where: { actorId: actor.id, action: "META_INVENTARIO_UNIFICADO" },
          }),
          1,
        );
        await assert.rejects(
          () =>
            unifyInventoryDiplomas(actor, {
              ...request,
              token: "f".repeat(64),
            }),
          /ya se utilizó/,
        );
      },
    );
  } finally {
    await db.metaAdAccount.delete({ where: { id: account.id } });
    await db.metaConnection.delete({ where: { id: conn.id } });
    await db.metaEffectivenessRow.deleteMany({
      where: { aliasId: { in: aliases.map((a) => a.id) } },
    });
    await db.metaAlias.deleteMany({ where: { inventorySheetId: list.id } });
    await db.metaInventoryItem.deleteMany({ where: { sheetId: list.id } });
    await db.metaEffectivenessSheet.delete({ where: { id: list.id } });
    await db.metaAliasTable.deleteMany({
      where: { id: { in: tables.map((t) => t.id) } },
    });
    await db.auditEvent.deleteMany({ where: { actorId: actor.id } });
    await db.user.delete({ where: { id: owner.id } });
    await db.$disconnect();
  }
});
