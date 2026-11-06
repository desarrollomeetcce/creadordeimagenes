import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { db } from "../lib/db";
import { launchHistory } from "../lib/creative-studio/campaigns";
test("Campaign bitacora reads authorized settings only, keeps failed attempts, and never fetches images or Meta", async () => {
  assert(/studio_columns_qa_\d+/.test(process.env.DATABASE_URL ?? ""));
  const q = JSON.parse(
      await readFile("/workspace/work/studio-columns-fixture.json", "utf8"),
    ),
    owner = await db.user.findUniqueOrThrow({ where: { id: q.users[0].id } }),
    other = await db.user.findUniqueOrThrow({ where: { id: q.users[1].id } });
  const fetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw Error("History must not call Meta or media");
  };
  const config = {
    accountId: q.accountId,
    pageId: q.pageId,
    country: "UY",
    dailyBudget: 10,
    headline: "Diplomado {diplomado}",
    body: "Info",
    audiences: [{ name: "A" }],
    variationRevisions: { privateImage: 1 },
    savedTargeting: [{ private: "metadata" }],
  };
  const created = await db.creativeMetaLaunch.create({
    data: {
      actorId: owner.id,
      projectId: q.projectId,
      categoryId: q.productId,
      requestId: randomUUID(),
      accountId: q.accountId,
      connectionId: q.connectionId,
      connectionRevision: 1,
      status: "NEEDS_REVIEW",
      config,
      campaigns: [{ name: "Test", variationIds: ["privateImage"] }],
      error: "Synthetic permission error",
    },
  });
  try {
    const r = await launchHistory(owner, q.productId);
    const row = r.items.find((r) => r.id === created.id);
    assert(row);
    assert.equal(row.status, "NEEDS_REVIEW");
    assert(!JSON.stringify(r).includes("privateImage"));
    assert(!JSON.stringify(r).includes("savedTargeting"));
    assert(!JSON.stringify(r).includes("variationIds"));
    await assert.rejects(() => launchHistory(other, q.productId));
    assert.equal(
      (
        await db.creativeMetaLaunch.findUniqueOrThrow({
          where: { id: created.id },
        })
      ).status,
      "NEEDS_REVIEW",
    );
  } finally {
    globalThis.fetch = fetch;
    await db.creativeMetaLaunch.delete({ where: { id: created.id } });
    await db.$disconnect();
  }
});
