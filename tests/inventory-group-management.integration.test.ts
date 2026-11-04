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
      "traslado entre grupos valida ambas revisiones y conserva ciclos anteriores",
      async () => {
        const args = {
          action: "MOVE_MEMBER",
          listId: list.id,
          groupId: g.id,
          revision,
          itemId: items[1].id,
          targetGroupId: g2.id,
          targetRevision: g2.revision,
          since: "2026-11-04",
        };
        const originalSource =
          await db.metaInventoryTrialGroup.findUniqueOrThrow({
            where: { id: g.id },
          });
        const originalTarget =
          await db.metaInventoryTrialGroup.findUniqueOrThrow({
            where: { id: g2.id },
          });
        await assert.rejects(
          () =>
            saveInventoryTrial(actor, {
              ...args,
              targetRevision: g2.revision + 1,
            }),
          /cambió/,
        );
        await assert.rejects(
          () => saveInventoryTrial(actor, { ...args, revision: revision + 1 }),
          /cambió/,
        );
        await assert.rejects(
          () =>
            saveInventoryTrial(actor, {
              ...args,
              targetGroupId: g.id,
              targetRevision: revision,
            }),
          /otro grupo/,
        );
        assert.deepEqual(
          (
            await db.metaInventoryTrialGroup.findUniqueOrThrow({
              where: { id: g.id },
            })
          ).payload,
          originalSource.payload,
        );
        const next = await saveInventoryTrial(actor, args);
        assert("members" in next && next.members);
        assert.deepEqual(
          next.members.map((entry) => entry.itemId).sort(),
          [items[1].id, items[2].id].sort(),
        );
        const source = await db.metaInventoryTrialGroup.findUniqueOrThrow({
          where: { id: g.id },
        });
        revision = source.revision;
        const payload = source.payload as unknown as TrialPayload;
        assert.equal(payload.members.length, 1);
        assert.equal(payload.members[0].itemId, items[0].id);
        const old = originalSource.payload as unknown as TrialPayload;
        assert.deepEqual(
          payload.cycles.map((c) => c.id),
          old.cycles.map((c) => c.id),
        );
        assert(
          payload.cycles
            .filter((c) => c.itemId === items[1].id)
            .every((c) => c.until === "2026-11-03"),
        );
        const target = next as unknown as TrialPayload;
        assert.equal(
          target.cycles[0].id,
          (originalTarget.payload as unknown as TrialPayload).cycles[0].id,
        );
        assert(
          target.cycles.some(
            (c) =>
              c.itemId === items[1].id && c.since === "2026-11-04" && !c.until,
          ),
        );
        await assert.rejects(() => saveInventoryTrial(actor, args), /cambió/);
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
