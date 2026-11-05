import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../lib/db";
import { advisorSheet, saveAdvisor } from "../lib/meta-ads/advisors";
import { authorizeFinancialRequest } from "../lib/meta-ads/financial-access";
import { limaDay } from "../lib/meta-ads/advisor-attribution";
test("advisor employment is shared, scoped and revision checked while retaining attendance and unrelated sheet configuration", async () => {
  assert(
    process.env.DATABASE_URL?.includes("library_organization_test") &&
      process.env.DATABASE_URL.includes("/workspace/work/pgdata"),
  );
  const tag = randomUUID(),
    day = limaDay();
  const users = await Promise.all(
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
  const sheet = await db.metaEffectivenessSheet.create({
    data: {
      name: tag,
      kind: "ADVISORS",
      config: { selected: [table.id], preserved: "keep" },
    },
  });
  const other = await db.metaEffectivenessSheet.create({
    data: { name: tag + "other", kind: "ADVISORS" },
  });
  const person = await db.metaAdvisor.create({
      data: { name: "ANA", sheetId: sheet.id },
    }),
    foreign = await db.metaAdvisor.create({
      data: { name: "FOREIGN", sheetId: other.id },
    });
  await db.metaAdvisorAttendance.create({
    data: { advisorId: person.id, day, status: "PRESENT" },
  });
  const facts = await db.metaAdvisorAttendance.findMany({
    where: { advisorId: person.id },
  });
  try {
    await db.effectivenessGrant.createMany({
      data: [
        {
          scope: "TAB:" + sheet.id,
          userId: editor.id,
          grantedById: owner.id,
          permission: "EDIT",
        },
        {
          scope: "TAB:" + sheet.id,
          userId: viewer.id,
          grantedById: owner.id,
          permission: "VIEW",
        },
      ],
    });
    const patch = {
      id: person.id,
      name: person.name,
      revision: 0,
      employmentActive: false,
    };
    const actor = await authorizeFinancialRequest(
      editor,
      "advisors",
      "PATCH",
      new URLSearchParams(),
      patch,
      "TAB:" + sheet.id,
    );
    await saveAdvisor(actor, patch);
    for (const user of users) {
      const args = {
        advisorListId: sheet.id,
        tableId: table.id,
        since: day,
        until: day,
      };
      const reader = await authorizeFinancialRequest(
        user,
        "advisors/sheet",
        "GET",
        new URLSearchParams(args),
        undefined,
        "TAB:" + sheet.id,
      );
      const result = await advisorSheet(reader, table.id, day, day, {
        advisorListId: sheet.id,
      });
      assert.equal(result.rows.length, 1);
      assert.equal(result.rows[0].employmentActive, false);
      assert.equal(result.rows[0].days[day].status, "PRESENT");
    }
    await assert.rejects(saveAdvisor(actor, patch), /asesor cambió/);
    await assert.rejects(
      authorizeFinancialRequest(
        viewer,
        "advisors",
        "PATCH",
        new URLSearchParams(),
        patch,
        "TAB:" + sheet.id,
      ),
    );
    await assert.rejects(
      authorizeFinancialRequest(
        editor,
        "advisors",
        "PATCH",
        new URLSearchParams(),
        { ...patch, id: foreign.id },
        "TAB:" + sheet.id,
      ),
    );
    const config = (
      await db.metaEffectivenessSheet.findUniqueOrThrow({
        where: { id: sheet.id },
      })
    ).config as Record<string, unknown>;
    assert.equal(config.preserved, "keep");
    assert.deepEqual(config.selected, [table.id]);
    assert.deepEqual(config.advisorInactiveIds, [person.id]);
    await saveAdvisor(actor, { ...patch, revision: 1, employmentActive: true });
    assert.deepEqual(
      await db.metaAdvisorAttendance.findMany({
        where: { advisorId: person.id },
      }),
      facts,
    );
  } finally {
    await db.effectivenessGrant.deleteMany({
      where: { userId: { in: users.map((u) => u.id) } },
    });
    await db.auditEvent.deleteMany({
      where: { actorId: { in: users.map((u) => u.id) } },
    });
    await db.metaAdvisorAttendance.deleteMany({
      where: { advisorId: person.id },
    });
    await db.metaAdvisor.deleteMany({
      where: { id: { in: [person.id, foreign.id] } },
    });
    await db.metaEffectivenessSheet.deleteMany({
      where: { id: { in: [sheet.id, other.id] } },
    });
    await db.metaAliasTable.delete({ where: { id: table.id } });
    await db.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
    await db.$disconnect();
  }
});
