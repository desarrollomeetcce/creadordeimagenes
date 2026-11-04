import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../lib/db";
import {
  inventoryTrials,
  saveInventoryTrial,
} from "../lib/meta-ads/inventory-trials";
import type { TrialPayload } from "../lib/meta-ads/inventory-trial-policy";

test("Asignar, nombres únicos y eliminar solo grupo", async (t) => {
  assert(
    process.env.DATABASE_URL?.includes("library_organization_test") &&
      process.env.DATABASE_URL.includes("/workspace/work/pgdata"),
    "Solo QA",
  );
  const tag = randomUUID(),
    owner = await db.user.create({
      data: {
        name: "QA grupos",
        email: tag + "@example.test",
        passwordHash: "synthetic",
        role: "OWNER",
        status: "APPROVED",
      },
    }),
    actor = { id: owner.id, role: owner.role };
  const list = await db.metaEffectivenessSheet.create({
    data: { name: tag, kind: "INVENTORY" },
  });
  const items = await Promise.all(
    ["Uno", "Dos", "Tres"].map((name) =>
      db.metaInventoryItem.create({
        data: { sheetId: list.id, name: name + tag },
      }),
    ),
  );
  const create = (name: string, itemIds: string[]) =>
    saveInventoryTrial(actor, {
      action: "CREATE",
      listId: list.id,
      name,
      itemIds,
      countries: ["PE"],
      since: "2026-11-03",
      reserve: false,
      diverse: false,
      rules: { zero: 25, perSale: 50 },
    });
  try {
    const g = await create("Grupo 1", [items[0].id]);
    assert("members" in g && typeof g.revision === "number");
    await t.test("crear nombre equivalente avisa y no crea otro", async () => {
      await assert.rejects(
        () => create(" GRUPO 1 ", [items[1].id]),
        /Ya existe/,
      );
      assert.equal(
        await db.metaInventoryTrialGroup.count({ where: { sheetId: list.id } }),
        1,
      );
    });
    const g2 = await create("Grupo 2", [items[2].id]);
    assert("members" in g2 && typeof g2.revision === "number");
    await t.test(
      "renombrar o guardar miembros no puede duplicar nombre",
      async () => {
        for (const action of ["RENAME", "MEMBERS"])
          await assert.rejects(
            () =>
              saveInventoryTrial(actor, {
                action,
                listId: list.id,
                groupId: g2.id,
                revision: g2.revision,
                name: "GRUPO 1",
                ...(action === "MEMBERS"
                  ? { itemIds: [items[2].id], since: "2026-11-03" }
                  : {}),
              }),
            /Ya existe/,
          );
      },
    );
    let revision = g.revision;
    await t.test(
      "asignación suma seleccionados conservando miembros y ciclos",
      async () => {
        const next = await saveInventoryTrial(actor, {
          action: "ADD_MEMBERS",
          listId: list.id,
          groupId: g.id,
          revision,
          itemIds: [items[1].id],
          since: "2026-11-03",
        });
        assert("members" in next && typeof next.revision === "number");
        revision = next.revision;
        assert.deepEqual(
          next.members.map((m) => m.itemId).sort(),
          [items[0].id, items[1].id].sort(),
        );
        assert.equal(next.members[0].slotId, g.members[0].slotId);
        assert.equal(next.cycles[0].id, g.cycles[0].id);
        const same = await saveInventoryTrial(actor, {
          action: "ADD_MEMBERS",
          listId: list.id,
          groupId: g.id,
          revision,
          itemIds: [items[1].id],
          since: "2026-11-03",
        });
        assert("members" in same && typeof same.revision === "number");
        revision = same.revision;
        assert.equal(same.members.length, 2);
        assert.equal(same.cycles.length, 2);
      },
    );
    await t.test(
      "asignado a otro grupo y revisión antigua se rechazan sin cambios parciales",
      async () => {
        await assert.rejects(
          () =>
            saveInventoryTrial(actor, {
              action: "ADD_MEMBERS",
              listId: list.id,
              groupId: g.id,
              revision,
              itemIds: [items[2].id],
              since: "2026-11-03",
            }),
          /grupo/,
        );
        await assert.rejects(
          () =>
            saveInventoryTrial(actor, {
              action: "ARCHIVE",
              listId: list.id,
              groupId: g.id,
              revision: g.revision,
            }),
          /cambió/,
        );
      },
    );
    await t.test(
      "eliminar grupo lo retira de directorio conservando fichas e historial",
      async () => {
        const before = await db.metaInventoryTrialGroup.findUniqueOrThrow({
          where: { id: g.id },
        });
        await saveInventoryTrial(actor, {
          action: "ARCHIVE",
          listId: list.id,
          groupId: g.id,
          revision,
        });
        const after = await db.metaInventoryTrialGroup.findUniqueOrThrow({
          where: { id: g.id },
        });
        assert(after.archivedAt);
        assert.deepEqual(after.payload, before.payload);
        assert.equal(
          await db.metaInventoryItem.count({ where: { sheetId: list.id } }),
          3,
        );
        const directory = await inventoryTrials(actor, { listId: list.id });
        assert.deepEqual(
          directory.groups.map((entry) => entry.id),
          [g2.id],
        );
        const replacement = await create("Grupo 1", [items[0].id]);
        assert("members" in replacement && replacement.members);
        assert.equal(replacement.members[0].itemId, items[0].id);
        assert.equal(
          (after.payload as unknown as TrialPayload).cycles.length,
          2,
        );
      },
    );
  } finally {
    await db.metaInventoryItem.deleteMany({ where: { sheetId: list.id } });
    await db.metaEffectivenessSheet.delete({ where: { id: list.id } });
    await db.auditEvent.deleteMany({ where: { actorId: actor.id } });
    await db.user.delete({ where: { id: owner.id } });
    await db.$disconnect();
  }
});
