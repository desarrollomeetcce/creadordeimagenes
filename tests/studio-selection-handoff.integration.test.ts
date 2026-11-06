import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { db } from "../lib/db";
import {
  saveInventorySelection,
  prepareInventorySelection,
  addStudioItems,
} from "../lib/creative-studio/service";
test("Replacement handoff selects its inventory and country folder, preserves other countries and is idempotent under concurrent retries; no providers", async () => {
  assert(/studio_columns_qa_\d+/.test(process.env.DATABASE_URL ?? ""));
  const q = JSON.parse(
      await readFile("/workspace/work/studio-columns-fixture.json", "utf8"),
    ),
    owner = await db.user.findUniqueOrThrow({ where: { id: q.users[0].id } }),
    other = await db.user.findUniqueOrThrow({ where: { id: q.users[1].id } }),
    p = await db.project.create({
      data: {
        ownerId: owner.id,
        name: "Handoff QA " + randomUUID(),
        prompt: "Original instructions",
        studio: { keep: "original" },
      },
    }),
    co = await db.category.create({
      data: {
        projectId: p.id,
        name: "COLOMBIA",
        studio: { country: "CO", keep: "original" },
      },
    }),
    prior = await db.subproduct.create({
      data: {
        categoryId: co.id,
        name: "Existing CO",
        prompt: "Original diploma instructions",
      },
    }),
    originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    throw Error("No external providers in handoff QA");
  };
  const selections: string[] = [];
  try {
    const selection = await saveInventorySelection(owner, {
      listId: q.inventoryId,
      country: "AR",
      itemIds: [q.itemIds[1], q.itemIds[0]],
    });
    selections.push(selection.id);
    const payload = { projectId: p.id, preferredCategoryId: co.id },
      [a, b] = await Promise.all([
        prepareInventorySelection(owner, selection.id, payload),
        prepareInventorySelection(owner, selection.id, payload),
      ]);
    assert.equal(a.category.id, b.category.id);
    assert.equal(a.category.name, "Argentina");
    assert.equal(a.country, "AR");
    assert.equal(a.listId, q.inventoryId);
    assert.deepEqual(a.items, b.items);
    assert.equal(a.items.length, 2);
    assert.equal(await db.category.count({ where: { projectId: p.id } }), 2);
    assert.equal(
      await db.subproduct.count({ where: { categoryId: a.category.id } }),
      2,
    );
    const inputs = await db.metaInventoryItem.findMany({
      where: { id: { in: [q.itemIds[1], q.itemIds[0]] } },
    });
    assert.equal(
      a.items[0].name,
      inputs.find((i) => i.id === q.itemIds[1])!.name,
    );
    assert.deepEqual(
      (await db.category.findUniqueOrThrow({ where: { id: co.id } })).studio,
      co.studio,
    );
    assert.equal(
      (await db.subproduct.findUniqueOrThrow({ where: { id: prior.id } }))
        .prompt,
      prior.prompt,
    );
    assert.equal(
      (await db.project.findUniqueOrThrow({ where: { id: p.id } })).prompt,
      p.prompt,
    );
    await assert.rejects(
      () => prepareInventorySelection(other, selection.id, payload),
      /selección no está disponible/,
    );
    await assert.rejects(
      () =>
        addStudioItems(owner, a.category.id, {
          listId: q.inventoryId,
          itemIds: [q.itemIds[0]],
          expectedCountry: "CO",
        }),
      /cambió de país/,
    );
    const old = await db.subproduct.findUniqueOrThrow({
      where: { id: a.items[0].id },
    });
    await db.subproduct.update({
      where: { id: old.id },
      data: { studio: { ...(old.studio as any), listId: "different-source" } },
    });
    await assert.rejects(
      () => prepareInventorySelection(owner, selection.id, payload),
      /otro inventario/,
    );
    await db.subproduct.update({
      where: { id: old.id },
      data: { studio: old.studio as any },
    });
    const missing = await db.creativeInventorySelection.create({
      data: {
        actorId: owner.id,
        listId: q.inventoryId,
        country: "EC",
        itemIds: [q.itemIds[0], "missing-inventory-item"],
      },
    });
    selections.push(missing.id);
    const count = await db.category.count({ where: { projectId: p.id } });
    await assert.rejects(
      () => prepareInventorySelection(owner, missing.id, payload),
      /selección del inventario cambió/,
    );
    assert.equal(
      await db.category.count({ where: { projectId: p.id } }),
      count,
    );
    assert.equal(calls, 0);
    console.log(
      "PASS Colombia untouched; Argentina auto-prepared with ordered canonical diplomas; concurrent/repeated handoff shares IDs, actor/source/country/partial-selection fences reject; no Meta or IA",
    );
  } finally {
    globalThis.fetch = originalFetch;
    await db.creativeInventorySelection.deleteMany({
      where: { id: { in: selections } },
    });
    await db.subproduct.deleteMany({
      where: { category: { projectId: p.id } },
    });
    await db.category.deleteMany({ where: { projectId: p.id } });
    await db.project.delete({ where: { id: p.id } });
    await db.$disconnect();
  }
});
