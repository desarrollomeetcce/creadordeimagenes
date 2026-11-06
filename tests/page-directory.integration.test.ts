import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { db } from "../lib/db";
import {
  campaignPageDirectory,
  safePagePicture,
} from "../lib/creative-studio/page-directory";
import { launchResources } from "../lib/creative-studio/campaigns";
test("Page directory survives new requests, coalesces, respects credential revision and never grants account access", async () => {
  assert(/studio_columns_qa_\d+/.test(process.env.DATABASE_URL ?? ""));
  const q = JSON.parse(
      await readFile("/workspace/work/studio-columns-fixture.json", "utf8"),
    ),
    owner = await db.user.findUniqueOrThrow({ where: { id: q.users[0].id } }),
    other = await db.user.findUniqueOrThrow({ where: { id: q.users[1].id } }),
    a = await db.metaAdAccount.findUniqueOrThrow({
      where: { id: q.accountId },
      include: { connection: true },
    });
  let reads = 0;
  const load = async () => {
    reads++;
    return {
      data: [
        {
          id: q.pageId,
          name: "Pinned page",
          picture: {
            data: { url: "https://graph.facebook.com/a?access_token=secret" },
          },
          access_token: "never-store",
          whatsapp_number: "+51999999999",
        },
      ],
    };
  };
  try {
    const fresh = await campaignPageDirectory(a, load);
    assert.equal(reads, 1);
    assert.equal(fresh.pageCached, false);
    assert.equal(fresh.pages[0].picture, "");
    assert(
      !JSON.stringify(
        await db.creativeMetaPageDirectory.findUnique({
          where: { accountId: a.id },
        }),
      ).includes("secret"),
    );
    const reused = await campaignPageDirectory(a, load);
    assert.equal(reads, 1);
    assert.equal(reused.pageCached, true);
    assert.equal((await launchResources(owner, a.id, "pages")).pages.length, 1);
    assert.equal(reads, 1);
    await assert.rejects(launchResources(other, a.id, "pages"));
    await db.metaWorkspaceGrant.create({
      data: { userId: other.id, grantedById: owner.id, permission: "EDIT" },
    });
    assert.equal((await launchResources(other, a.id, "pages")).pages.length, 1);
    await db.metaWorkspaceGrant.delete({ where: { userId: other.id } });
    await assert.rejects(launchResources(other, a.id, "pages"));
    const limited = await campaignPageDirectory(
      a,
      async () => {
        throw Object.assign(new Error("quota"), {
          status: 429,
          retryAt: new Date(Date.now() + 60000),
        });
      },
      true,
    );
    assert.equal(limited.pages.length, 1);
    assert.equal(limited.pageIssue?.kind, "RATE_LIMIT");
    assert.equal(limited.pageCached, true);
    await db.metaConnection.update({
      where: { id: a.connectionId },
      data: { revision: { increment: 1 } },
    });
    const rotated = await db.metaAdAccount.findUniqueOrThrow({
      where: { id: a.id },
      include: { connection: true },
    });
    await campaignPageDirectory(rotated, load);
    assert.equal(reads, 2);
    const denied = await campaignPageDirectory(
      rotated,
      async () => {
        throw Object.assign(new Error("permission"), { status: 403 });
      },
      true,
    );
    assert.equal(denied.pages.length, 0);
    assert.equal(
      await db.creativeMetaPageDirectory.count({ where: { accountId: a.id } }),
      0,
    );
    let finish!: () => void, entered!: () => void;
    const gate = new Promise<void>((r) => (finish = r)),
      started = new Promise<void>((r) => (entered = r));
    let concurrentReads = 0;
    const slow = async () => {
      concurrentReads++;
      entered();
      await gate;
      return { data: [{ id: q.pageId, name: "Concurrent page" }] };
    };
    const first = campaignPageDirectory(rotated, slow);
    await started;
    const second = campaignPageDirectory(rotated, slow);
    await new Promise((r) => setTimeout(r, 30));
    finish();
    await Promise.all([first, second]);
    assert.equal(concurrentReads, 1);
    const empty = await campaignPageDirectory(
      rotated,
      async () => ({ data: [] }),
      true,
    );
    assert.equal(empty.pages.length, 0);
    assert.equal(
      await db.creativeMetaPageDirectory.count({ where: { accountId: a.id } }),
      0,
    );
    assert.equal(safePagePicture("https://evil.test/logo.png"), "");
    assert.equal(
      safePagePicture("https://scontent.xx.fbcdn.net/logo.png"),
      "https://scontent.xx.fbcdn.net/logo.png",
    );
  } finally {
    await db.metaWorkspaceGrant.deleteMany({ where: { userId: other.id } });
    await db.metaConnection.update({
      where: { id: a.connectionId },
      data: { revision: a.connection.revision },
    });
    await db.creativeMetaPageDirectory.deleteMany({
      where: { accountId: a.id },
    });
    await db.$disconnect();
  }
});
