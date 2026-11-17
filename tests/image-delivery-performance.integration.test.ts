import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import sharp from "sharp";
import { db } from "../lib/db";
import { metaThumbnail } from "../lib/meta-ads/thumbnail";

test(
  "cached previews keep live authorization, revisions, expiry and originals; uploads remain idempotent",
  {
    skip: process.env.RUN_IMAGE_DELIVERY_QA !== "1",
  },
  async () => {
    assert.equal(new URL(process.env.DATABASE_URL!).pathname, "/delivery_qa");
    const root = process.env.TEST_APP_URL!;
    assert.ok(/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(root));
    const tag = randomUUID();
    const users = await Promise.all(
      (["OWNER", "USER"] as const).map((role) =>
        db.user.create({
          data: {
            name: "Image performance QA",
            email: role + tag + "@example.invalid",
            passwordHash: "synthetic",
            role,
            status: "APPROVED",
          },
        }),
      ),
    );
    const raw = users.map(() => randomUUID());
    for (const [i, user] of users.entries())
      await db.session.create({
        data: {
          id: createHash("sha256").update(raw[i]).digest("hex"),
          userId: user.id,
          expiresAt: new Date(Date.now() + 3600000),
        },
      });
    const project = await db.project.create({
      data: { name: tag, ownerId: users[0].id },
    });
    const category = await db.category.create({
      data: { name: tag, projectId: project.id },
    });
    const sub = await db.subproduct.create({
      data: { name: tag, categoryId: category.id },
    });
    const image = await sharp({
      create: { width: 1200, height: 800, channels: 3, background: "#3388bb" },
    })
      .jpeg()
      .toBuffer();
    const call = (path: string, i = 0, init: RequestInit = {}) =>
      fetch(root + "/api/" + path, {
        ...init,
        headers: { Cookie: "session=" + raw[i], Origin: root, ...init.headers },
      });
    let variationId = "",
      connectionId = "";
    try {
      const requestId = randomUUID();
      const upload = async () => {
        const form = new FormData();
        form.set(
          "file",
          new File([new Uint8Array(image)], "qa.jpg", { type: "image/jpeg" }),
        );
        form.set("requestId", requestId);
        form.set("storage", "campaign");
        const r = await call("creative-studio/upload/" + sub.id, 0, {
          method: "POST",
          body: form,
        });
        assert.equal(r.status, 201);
        return r.json();
      };
      variationId = (await upload()).id;
      assert.equal((await upload()).id, variationId);
      assert.equal(
        await db.variation.count({ where: { subproductId: sub.id } }),
        1,
      );
      const url = "variations/" + variationId + "?thumbnail=true&v=1";
      const first = await call(url);
      assert.equal(first.status, 200);
      const etag = first.headers.get("etag")!;
      const firstBytes = Buffer.from(await first.arrayBuffer());
      const previews = await Promise.all(
        Array.from({ length: 8 }, () => call(url)),
      );
      for (const r of previews) {
        assert.equal(r.status, 200);
        assert.deepEqual(Buffer.from(await r.arrayBuffer()), firstBytes);
      }
      const meta = await sharp(firstBytes).metadata();
      assert.ok(meta.width! <= 640 && meta.height! <= 640);
      const original = await call("variations/" + variationId);
      assert.deepEqual(Buffer.from(await original.arrayBuffer()), image);
      const revalidated = await call(url, 0, {
        headers: { "If-None-Match": etag },
      });
      assert.equal(revalidated.status, 304);
      assert.equal((await call(url, 1)).status, 404);
      await db.subproductMember.create({
        data: { subproductId: sub.id, userId: users[1].id },
      });
      assert.equal((await call(url, 1)).status, 200);
      await db.subproductMember.deleteMany({ where: { subproductId: sub.id } });
      assert.equal(
        (await call(url, 1, { headers: { "If-None-Match": etag } })).status,
        404,
      );
      await db.variation.update({
        where: { id: variationId },
        data: { revision: 2 },
      });
      const revised = await call(url, 0, {
        headers: { "If-None-Match": etag },
      });
      assert.equal(revised.status, 200);
      assert.notEqual(revised.headers.get("etag"), etag);
      await db.variation.update({
        where: { id: variationId },
        data: { expiresAt: new Date(0) },
      });
      assert.equal((await call(url)).status, 410);
      await db.variation.update({
        where: { id: variationId },
        data: {
          expiresAt: new Date(Date.now() + 3600000),
          deletedAt: new Date(),
        },
      });
      assert.equal((await call(url)).status, 404);
      // Meta thumbnails use only mocked provider bytes. No Graph calls or tokens.
      const conn = await db.metaConnection.create({
        data: { ownerId: users[0].id, name: tag, transport: "API" },
      });
      connectionId = conn.id;
      const account = await db.metaAdAccount.create({
        data: {
          id: tag,
          connectionId,
          name: tag,
          currency: "PEN",
          timezone: "America/Lima",
          syncState: { ignored: "x".repeat(500000) },
        },
      });
      const object = await db.metaAdObject.create({
        data: {
          id: tag,
          accountId: account.id,
          level: "AD",
          name: tag,
          thumbnailUrl: "https://synthetic.fbcdn.net/" + tag,
        },
      });
      const nativeFetch = globalThis.fetch;
      let providerReads = 0;
      globalThis.fetch = async (input) => {
        assert.match(String(input), /^https:\/\/synthetic\.fbcdn\.net\//);
        providerReads++;
        return new Response(new Uint8Array(image), {
          headers: { "Content-Type": "image/jpeg" },
        });
      };
      try {
        const actor = { id: users[0].id, role: "OWNER" };
        await metaThumbnail(actor, object.id);
        await metaThumbnail(actor, object.id);
        assert.equal(providerReads, 1);
        const viewer = { id: users[1].id, role: "USER" };
        await db.metaAccountGrant.create({
          data: { accountId: account.id, userId: viewer.id },
        });
        await metaThumbnail(viewer, object.id);
        await db.metaAccountGrant.deleteMany({
          where: { accountId: account.id, userId: viewer.id },
        });
        await assert.rejects(
          metaThumbnail(viewer, object.id),
          /Cuenta publicitaria no disponible/,
        );
        assert.equal(providerReads, 1);
        await db.metaAdObject.update({
          where: { id: object.id },
          data: { thumbnailUrl: object.thumbnailUrl + "?revision=2" },
        });
        await metaThumbnail(actor, object.id);
        assert.equal(providerReads, 2);
      } finally {
        globalThis.fetch = nativeFetch;
      }
    } finally {
      if (connectionId)
        await db.metaConnection.delete({ where: { id: connectionId } });
      await db.imageVersion.deleteMany({
        where: { variation: { subproductId: sub.id } },
      });
      await db.variation.deleteMany({ where: { subproductId: sub.id } });
      await db.generationJob.deleteMany({ where: { subproductId: sub.id } });
      await db.subproduct.delete({ where: { id: sub.id } });
      await db.category.delete({ where: { id: category.id } });
      await db.project.delete({ where: { id: project.id } });
      await db.session.deleteMany({
        where: { userId: { in: users.map((u) => u.id) } },
      });
      await db.auditEvent.deleteMany({
        where: { actorId: { in: users.map((u) => u.id) } },
      });
      await db.user.deleteMany({
        where: { id: { in: users.map((u) => u.id) } },
      });
      await db.$disconnect();
    }
  },
);
