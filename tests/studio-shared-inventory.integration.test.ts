import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../lib/db";
import {
  studioContext,
  studioInventory,
  createStudioProduct,
  setProductCountry,
} from "../lib/creative-studio/service";
test("Studio discovers shared inventories for project editors and country can be assigned after folder creation", async () => {
  assert(
    /studio_columns_qa_\d+/.test(process.env.DATABASE_URL ?? "") &&
      process.env.DATABASE_URL?.includes("/workspace/work/pgdata"),
  );
  const tag = randomUUID(),
    users = await Promise.all(
      ["OWNER", "USER", "USER"].map((role, i) =>
        db.user.create({
          data: {
            name: "Studio sharing QA " + i,
            email: i + tag + "@example.test",
            role: role as any,
            passwordHash: "synthetic",
            status: "APPROVED",
          },
        }),
      ),
    ),
    [owner, editor, other] = users;
  const p = await db.project.create({
      data: { ownerId: owner.id, name: tag, prompt: "Keep project prompt" },
    }),
    lists = await Promise.all(
      ["shared", "private"].map((name) =>
        db.metaEffectivenessSheet.create({
          data: { kind: "INVENTORY", name: name + tag },
        }),
      ),
    );
  try {
    await db.projectMember.create({
      data: { projectId: p.id, userId: editor.id, permission: "EDIT" },
    });
    await db.effectivenessGrant.create({
      data: {
        userId: editor.id,
        grantedById: owner.id,
        scope: "TAB:" + lists[0].id,
        permission: "EDIT",
      },
    });
    await db.metaInventoryItem.create({
      data: { sheetId: lists[0].id, name: "Shared diploma" },
    });
    const context = await studioContext(editor);
    assert(context.inventories.some((i) => i.id === lists[0].id));
    assert(context.inventories.some((i) => i.id === lists[1].id));
    assert.equal(
      (await studioInventory(editor, lists[0].id)).catalog.length,
      1,
    );
    assert.equal((await studioInventory(editor, lists[1].id)).catalog.length,0);
    await assert.rejects(studioInventory(other, lists[1].id));
    const product = await createStudioProduct(editor, p.id, {
      name: "New folder",
      requestId: randomUUID(),
    });
    assert.equal((product.studio as any).country, "");
    await setProductCountry(editor, product.id, { country: "PE" });
    assert.equal(
      (
        (await db.category.findUniqueOrThrow({ where: { id: product.id } }))
          .studio as any
      ).country,
      "PE",
    );
    assert.equal(
      (await db.project.findUniqueOrThrow({ where: { id: p.id } })).prompt,
      "Keep project prompt",
    );
    await assert.rejects(
      createStudioProduct(other, p.id, {
        name: "Denied",
        country: "CO",
        requestId: randomUUID(),
      }),
    );
    await assert.rejects(
      setProductCountry(editor, product.id, { country: "INVALID" }),
    );
    await db.effectivenessGrant.deleteMany({ where: { userId: editor.id } });
    assert(
      !(await studioContext(editor)).inventories.some(
        (i) => i.id === lists[0].id,
      ),
    );
    await assert.rejects(studioInventory(editor, lists[0].id));
    await assert.rejects(studioInventory(editor, lists[1].id));
  } finally {
    await db.category.deleteMany({ where: { projectId: p.id } });
    await db.projectMember.deleteMany({ where: { projectId: p.id } });
    await db.project.delete({ where: { id: p.id } });
    await db.metaInventoryItem.deleteMany({
      where: { sheetId: { in: lists.map((l) => l.id) } },
    });
    await db.metaEffectivenessSheet.deleteMany({
      where: { id: { in: lists.map((l) => l.id) } },
    });
    await db.effectivenessGrant.deleteMany({
      where: { userId: { in: users.map((u) => u.id) } },
    });
    await db.auditEvent.deleteMany({
      where: { actorId: { in: users.map((u) => u.id) } },
    });
    await db.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
    await db.$disconnect();
  }
});
