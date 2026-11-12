import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../lib/db";
import { orderTick } from "../lib/generation-orders";
import { firstRunnableJob } from "../lib/preview-approval";

test("large project orders still stop for sample approval and re-read revocations without any AI call", async () => {
  assert.match(process.env.DATABASE_URL ?? "", /localhost:55439\/delivery_qa$/);
  const original = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => {
    requests++;
    throw Error("No external calls in QA");
  };
  try {
    const actor = await db.user.create({
      data: {
        email: randomUUID() + "@example.invalid",
        name: "QA generation queue",
        passwordHash: "no-login",
        role: "OWNER",
        status: "APPROVED",
      },
    });
    const group = randomUUID();
    const jobs = await Promise.all(
      Array.from({ length: 199 }, (_, i) =>
        db.generationJob.create({
          data: {
            actorId: actor.id,
            projectId: "connection-test",
            idempotencyKey: randomUUID(),
            reservedMicros: 0n,
            snapshot: {
              previewFirst: true,
              approvalGroup: group,
              index: i + 1,
            },
          },
        }),
      ),
    );
    const runId = randomUUID();
    const order = await db.generationOrder.create({
      data: {
        actorId: actor.id,
        requestKey: "order:qa:" + randomUUID(),
        jobIds: jobs.map((j) => j.id),
        status: "ACTIVE",
        runId,
      },
    });
    assert.equal(await orderTick(order.id, runId), "REVIEW");
    assert.equal(
      (await db.generationOrder.findUniqueOrThrow({ where: { id: order.id } }))
        .status,
      "REVIEW",
    );
    assert.equal(
      await db.generationJob.count({
        where: { id: { in: jobs.map((j) => j.id) }, status: "PENDING" },
      }),
      199,
    );
    const sample = await db.generationJob.create({
      data: {
        actorId: actor.id,
        projectId: "connection-test",
        idempotencyKey: randomUUID(),
        reservedMicros: 0n,
        status: "COMPLETED",
        snapshot: { previewFirst: true, approvalGroup: group, index: 0 },
      },
    });
    const variation = await db.variation.create({
      data: {
        jobId: sample.id,
        path: "qa-unused",
        model: "qa",
        reviewStatus: "APPROVED",
        permanent: true,
        expiresAt: new Date(Date.now() + 86400000),
      },
    });
    assert.equal((await firstRunnableJob(db, jobs))?.id, jobs[0].id);
    await db.variation.update({
      where: { id: variation.id },
      data: { reviewStatus: "PENDING" },
    });
    assert.equal(await firstRunnableJob(db, jobs), null);
    await db.variation.update({
      where: { id: variation.id },
      data: { reviewStatus: "APPROVED", deletedAt: new Date() },
    });
    assert.equal(await firstRunnableJob(db, jobs), null);
    assert.equal(requests, 0);
    assert.equal(
      await db.usageLedger.count({
        where: { jobId: { in: jobs.map((j) => j.id) } },
      }),
      0,
    );
  } finally {
    globalThis.fetch = original;
    await db.$disconnect();
  }
});
