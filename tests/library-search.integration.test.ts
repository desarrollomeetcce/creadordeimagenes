import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../lib/db";
import { explorerData } from "../lib/library-explorer";
test("Library search is paginated, scoped and authorized across images, copies and documents", async () => {
  assert(
    (process.env.DATABASE_URL?.includes("library_organization_test") ||
      /studio_columns_qa_\d+/.test(process.env.DATABASE_URL ?? "")) &&
      process.env.DATABASE_URL?.includes("/workspace/work/pgdata"),
  );
  const tag = randomUUID(),
    owner = await db.user.create({
      data: {
        name: "Search owner",
        email: tag + "@example.test",
        passwordHash: "synthetic",
        role: "OWNER",
        status: "APPROVED",
      },
    }),
    other = await db.user.create({
      data: {
        name: "Search outsider",
        email: "x" + tag + "@example.test",
        passwordHash: "synthetic",
        role: "USER",
        status: "APPROVED",
      },
    });
  const p = await db.project.create({
      data: { name: "Studio " + tag, ownerId: owner.id, prompt: "QA" },
    }),
    c = await db.category.create({
      data: { projectId: p.id, name: "Colombia", prompt: "QA" },
    }),
    s = await db.subproduct.create({
      data: { categoryId: c.id, name: "Criminalística", prompt: "QA" },
    }),
    folder = await db.libraryFolder.create({
      data: {
        userId: owner.id,
        name: "Guías " + tag,
        anchorScope: "project",
        anchorId: p.id,
      },
    });
  try {
    for (let i = 0; i < 31; i++) {
      const j = await db.generationJob.create({
        data: {
          actorId: owner.id,
          projectId: p.id,
          subproductId: s.id,
          idempotencyKey: randomUUID(),
          status: "COMPLETED",
          snapshot: {},
          reservedMicros: 0,
        },
      });
      await db.variation.create({
        data: {
          subproductId: s.id,
          jobId: j.id,
          path: "qa-metadata-only",
          model: "Synthetic",
          reviewStatus: i === 0 ? "APPROVED" : "PENDING",
          expiresAt: new Date(Date.now() + 86400000),
        },
      });
    }
    const v = await db.variation.findFirstOrThrow({
      where: { subproductId: s.id },
    });
    await db.libraryImageCopy.create({
      data: {
        userId: owner.id,
        variationId: v.id,
        destinationKey: "folder:" + folder.id,
      },
    });
    await db.libraryDocument.create({
      data: {
        userId: owner.id,
        folderId: folder.id,
        name: "Guía " + tag + ".pdf",
        path: "qa-metadata-only",
        mime: "application/pdf",
        size: 12,
      },
    });
    const read = (q: Record<string, string>, actor = owner) =>
      explorerData(actor, new URLSearchParams({ limit: "25", ...q }));
    const first = await read({ q: tag });
    assert.equal(first.total, 32);
    assert.equal(first.items.length, 25);
    assert.equal(first.documents.length, 1);
    assert.equal(first.pages, 2);
    assert.equal(first.query, tag);
    assert.equal(first.foldersOnly, false);
    const second = await read({ q: tag, page: "2" });
    assert.equal(second.items.length, 7);
    assert.equal(
      new Set([...first.items, ...second.items].map((i) => i.selectionId)).size,
      32,
    );
    const words = await read({ q: "CRIMINALÍSTICA " + tag });
    assert.equal(words.total, 32);
    assert.equal(words.documents.length, 0);
    const inSub = await read({ q: tag, folder: "subproduct:" + s.id });
    assert.equal(inSub.total, 31);
    assert.equal(inSub.documents.length, 0);
    assert(inSub.items.every((i) => !i.copied));
    const approved = await read({
      q: tag,
      folder: "subproduct:" + s.id,
      review: "approved",
    });
    assert.equal(approved.total, 1);
    const missing = await read({ q: "not-present-" + tag });
    assert.equal(missing.total, 0);
    assert.equal(missing.documents.length, 0);
    const denied = await read({ q: tag }, other);
    assert.equal(denied.total, 0);
    assert.equal(denied.documents.length, 0);
    assert(!denied.tree.some((n) => n.id === "project:" + p.id));
    await assert.rejects(read({ q: tag, folder: "project:" + p.id }, other));
    assert.equal(
      await db.variation.count({ where: { subproductId: s.id } }),
      31,
    );
    assert.equal(
      await db.generationJob.count({
        where: { projectId: p.id, status: "PENDING" },
      }),
      0,
    );
  } finally {
    await db.libraryImageCopy.deleteMany({ where: { userId: owner.id } });
    await db.libraryDocument.deleteMany({ where: { userId: owner.id } });
    await db.libraryFolder.delete({ where: { id: folder.id } });
    await db.variation.deleteMany({ where: { subproductId: s.id } });
    await db.generationJob.deleteMany({ where: { projectId: p.id } });
    await db.subproduct.delete({ where: { id: s.id } });
    await db.category.delete({ where: { id: c.id } });
    await db.project.delete({ where: { id: p.id } });
    await db.user.deleteMany({ where: { id: { in: [owner.id, other.id] } } });
    await db.$disconnect();
  }
});
