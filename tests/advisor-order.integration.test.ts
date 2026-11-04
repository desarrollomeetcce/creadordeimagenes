import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../lib/db";
import { advisorSheet } from "../lib/meta-ads/advisors";
import {
  advisorOrderRevision,
  saveAdvisorOrder,
} from "../lib/meta-ads/advisor-order";
import { authorizeFinancialRequest } from "../lib/meta-ads/financial-access";
import { limaDay } from "../lib/meta-ads/advisor-attribution";
test("shared advisor order is scoped, atomic, revision checked and visible to every reader without changing facts", async () => {
  assert(
    process.env.DATABASE_URL?.includes("library_organization_test") &&
      process.env.DATABASE_URL.includes("/workspace/work/pgdata"),
  );
  const tag = randomUUID(),
    today = limaDay(),
    users = await Promise.all(
      (["OWNER", "USER", "OBSERVER"] as const).map((role, i) =>
        db.user.create({
          data: {
            role,
            status: "APPROVED",
            name: role,
            email: `${tag}-${i}@example.test`,
            passwordHash: "synthetic",
          },
        }),
      ),
    );
  const [owner, editor, viewer] = users;
  const table = await db.metaAliasTable.create({ data: { name: tag } });
  const list = await db.metaEffectivenessSheet.create({
    data: {
      name: tag,
      kind: "ADVISORS",
      config: { selected: [table.id], preserved: "settings" },
    },
  });
  const other = await db.metaEffectivenessSheet.create({
    data: { name: tag + " other", kind: "ADVISORS" },
  });
  const people = await Promise.all(
    ["ANA", "CESAR", "DONASYS"].map((name) =>
      db.metaAdvisor.create({ data: { sheetId: list.id, name } }),
    ),
  );
  const foreign = await db.metaAdvisor.create({
    data: { sheetId: other.id, name: "OTHER" },
  });
  const personIds = people.map((p) => p.id);
  await db.metaAdvisorAttendance.create({
    data: { advisorId: people[0].id, day: today, status: "PRESENT" },
  });
  const attendance = await db.metaAdvisorAttendance.findMany({
    where: { advisorId: { in: personIds } },
  });
  try {
    await db.effectivenessGrant.createMany({
      data: [
        {
          scope: "TAB:" + list.id,
          userId: editor.id,
          grantedById: owner.id,
          permission: "EDIT",
        },
        {
          scope: "TAB:" + list.id,
          userId: viewer.id,
          grantedById: owner.id,
          permission: "VIEW",
        },
      ],
    });
    const read = async (user = owner) => {
      const q = {
        advisorListId: list.id,
        tableId: table.id,
        since: today,
        until: today,
      };
      const actor = await authorizeFinancialRequest(
        user,
        "advisors/sheet",
        "GET",
        new URLSearchParams(q),
        undefined,
        "TAB:" + list.id,
      );
      return advisorSheet(actor, table.id, today, today, {
        advisorListId: list.id,
      });
    };
    const before = await read();
    assert.deepEqual(
      before.rows.map((p) => p.id),
      personIds,
    );
    assert.equal(
      before.advisorOrderRevision,
      advisorOrderRevision(list.config, people),
    );
    const ids = [people[2].id, people[0].id, people[1].id];
    const body = {
      advisorListId: list.id,
      advisorIds: ids,
      expectedRevision: before.advisorOrderRevision!,
    };
    const actor = await authorizeFinancialRequest(
      editor,
      "advisors/order",
      "PUT",
      new URLSearchParams(),
      body,
      "TAB:" + list.id,
    );
    const saved = await saveAdvisorOrder(actor, body);
    assert.deepEqual(saved.advisorIds, ids);
    for (const user of users)
      assert.deepEqual(
        (await read(user)).rows.map((p) => p.id),
        ids,
      );
    const config = (
      await db.metaEffectivenessSheet.findUniqueOrThrow({
        where: { id: list.id },
      })
    ).config as any;
    assert.equal(config.preserved, "settings");
    assert.deepEqual(config.selected, [table.id]);
    await assert.rejects(
      saveAdvisorOrder(actor, body),
      /orden compartido cambió/,
    );
    await assert.rejects(
      saveAdvisorOrder(actor, {
        ...body,
        expectedRevision: saved.revision,
        advisorIds: [people[0].id, people[0].id, people[2].id],
      }),
      /repitas/,
    );
    await assert.rejects(
      saveAdvisorOrder(actor, {
        ...body,
        expectedRevision: saved.revision,
        advisorIds: [foreign.id, people[0].id, people[1].id],
      }),
      /otra hoja/,
    );
    await assert.rejects(
      authorizeFinancialRequest(
        viewer,
        "advisors/order",
        "PUT",
        new URLSearchParams(),
        body,
        "TAB:" + list.id,
      ),
    );
    await assert.rejects(
      authorizeFinancialRequest(
        editor,
        "advisors/order",
        "PUT",
        new URLSearchParams(),
        { ...body, advisorListId: other.id },
        "TAB:" + list.id,
      ),
    );
    const viewerActor = await authorizeFinancialRequest(
      viewer,
      "advisors/sheet",
      "GET",
      new URLSearchParams({ advisorListId: list.id, tableId: table.id }),
      undefined,
      "TAB:" + list.id,
    );
    await assert.rejects(
      saveAdvisorOrder(viewerActor, {
        ...body,
        expectedRevision: saved.revision,
      }),
      /editar el orden/,
    );
    await saveAdvisorOrder(actor, {
      ...body,
      expectedRevision: saved.revision,
    });
    assert.equal(
      await db.auditEvent.count({
        where: { actorId: editor.id, action: "META_ASESORES_ORDENADOS" },
      }),
      1,
    );
    const extra = await db.metaAdvisor.create({
      data: { sheetId: list.id, name: "NEW" },
    });
    await assert.rejects(
      saveAdvisorOrder(actor, { ...body, expectedRevision: saved.revision }),
      /listado/,
    );
    await db.metaAdvisor.delete({ where: { id: extra.id } });
    await db.effectivenessGrant.delete({
      where: { scope_userId: { scope: "TAB:" + list.id, userId: editor.id } },
    });
    await assert.rejects(
      saveAdvisorOrder(actor, { ...body, expectedRevision: saved.revision }),
    );
    const after = await db.metaAdvisor.findMany({
      where: { sheetId: list.id },
      orderBy: { name: "asc" },
    });
    assert.deepEqual(after, people);
    assert.deepEqual(
      await db.metaAdvisorAttendance.findMany({
        where: { advisorId: { in: personIds } },
      }),
      attendance,
    );
    assert.deepEqual(
      (await read()).rows
        .map((p) => ({ ...p, sheet: undefined }))
        .sort((a, b) => a.id.localeCompare(b.id)),
      before.rows
        .map((p) => ({ ...p, sheet: undefined }))
        .sort((a, b) => a.id.localeCompare(b.id)),
    );
  } finally {
    await db.effectivenessGrant.deleteMany({
      where: { userId: { in: users.map((u) => u.id) } },
    });
    await db.metaAdvisorAttendance.deleteMany({
      where: { advisorId: { in: personIds } },
    });
    await db.metaAdvisor.deleteMany({
      where: { sheetId: { in: [list.id, other.id] } },
    });
    await db.metaEffectivenessSheet.deleteMany({
      where: { id: { in: [list.id, other.id] } },
    });
    await db.metaAliasTable.delete({ where: { id: table.id } });
    await db.auditEvent.deleteMany({
      where: { actorId: { in: users.map((u) => u.id) } },
    });
    await db.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
    await db.$disconnect();
  }
});
