import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { db } from "../lib/db";
import { encryptKey } from "../lib/crypto";
import { store } from "../lib/storage";
import { retryOrder } from "../lib/order-retry";
import { retryJob } from "../lib/jobs";

test("explicit order retry preserves completed work and uncertain costs, deduplicates requests and rolls back atomically", async () => {
  assert.match(process.env.DATABASE_URL ?? "", /localhost:55439\/delivery_qa/);
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    throw Error("No paid requests in QA");
  };
  const prior = await db.providerConfiguration.findUnique({
    where: { id: "global" },
  });
  try {
    const actor = await db.user.create({
      data: {
        email: randomUUID() + "@example.invalid",
        name: "QA retry owner",
        passwordHash: "no-login",
        role: "OWNER",
        status: "APPROVED",
      },
    });
    const other = await db.user.create({
      data: {
        email: randomUUID() + "@example.invalid",
        name: "QA other",
        passwordHash: "no-login",
        role: "USER",
        status: "APPROVED",
      },
    });
    const configuration = {
      provider: "google",
      imageModel: "gemini-3-pro-image-preview",
      creativeProvider: "google",
      creativeModel: "gemini-2.5-pro",
      quality: "default",
      resolution: "1K",
      status: "VERIFIED",
      revision: 12,
      verifiedRevision: 12,
      verifiedAt: new Date(),
      encryptedKey: encryptKey("synthetic-no-paid-key"),
      models: [
        {
          id: "gemini-3-pro-image-preview",
          kind: "image",
          qualities: ["default"],
          resolutions: ["1K"],
        },
        {
          id: "gemini-2.5-pro",
          kind: "creative",
          qualities: [],
          resolutions: [],
        },
      ],
    };
    await db.providerConfiguration.upsert({
      where: { id: "global" },
      create: { id: "global", ...configuration },
      update: configuration,
    });
    const png = await sharp({
      create: { width: 32, height: 32, channels: 3, background: "white" },
    })
      .png()
      .toBuffer();
    const path = await store(png);
    async function makeOrder(states: string[]) {
      const order = await db.generationOrder.create({
        data: {
          actorId: actor.id,
          requestKey: "order:qa:" + randomUUID(),
          jobIds: [],
          status: "NEEDS_REVIEW",
          error: "El proveedor no admite el modelo o los parámetros.",
        },
      });
      const jobs = [];
      for (let index = 0; index < states.length; index++) {
        const status = states[index];
        const job = await db.generationJob.create({
          data: {
            actorId: actor.id,
            projectId: "connection-test",
            idempotencyKey: randomUUID(),
            status,
            reservedMicros: 500n,
            error: status === "UNCERTAIN" ? "Resultado incierto" : null,
            snapshot: {
              orderId: order.id,
              executionMode: "immediate",
              prompt: "QA instrucciones originales",
              mode: "Imagen",
              format: "1:1",
              index,
              renderMode: "flat",
              reasoningLevel: "medium",
              configRevision: 11,
              imageQuality: "medium",
              imageResolution: "1024x1024",
            },
          },
        });
        await db.usageLedger.create({
          data: {
            jobId: job.id,
            actorId: actor.id,
            projectId: "connection-test",
            model: "old-model",
            reservedMicros: 500n,
            status:
              status === "COMPLETED"
                ? "CONSUMED_ESTIMATE"
                : status === "UNCERTAIN"
                  ? "UNCERTAIN"
                  : status === "FAILED"
                    ? "RELEASED"
                    : "RESERVED",
            actualMicros: status === "COMPLETED" ? 1000n : null,
          },
        });
        if (status === "COMPLETED")
          await db.variation.create({
            data: {
              jobId: job.id,
              path,
              model: "old-model",
              permanent: true,
              reviewStatus: "APPROVED",
              expiresAt: new Date(Date.now() + 86400000),
            },
          });
        jobs.push(job);
      }
      const current = await db.generationOrder.update({
        where: { id: order.id },
        data: { jobIds: jobs.map((j) => j.id) },
      });
      return { order: current, jobs };
    }
    const a = await makeOrder([
      "COMPLETED",
      "COMPLETED",
      "COMPLETED",
      "COMPLETED",
      "COMPLETED",
      "COMPLETED",
      "UNCERTAIN",
    ]);
    const request = {
      requestId: randomUUID(),
      expectedVersion: a.order.updatedAt.toISOString(),
      confirmCharge: true,
    };
    await assert.rejects(
      retryOrder(actor, a.order.id, { ...request, confirmCharge: false }),
    );
    await assert.rejects(retryOrder(other, a.order.id, request));
    await assert.rejects(
      retryJob(actor, a.jobs[6].id, randomUUID(), true),
      /desde la orden/,
    );
    assert.equal((await retryOrder(actor, a.order.id, request)).changed, true);
    const updated = await db.generationOrder.findUniqueOrThrow({
      where: { id: a.order.id },
    });
    const ids = updated.jobIds as string[];
    assert.equal(updated.status, "PAUSED");
    assert.deepEqual(
      ids.slice(0, 6),
      a.jobs.slice(0, 6).map((j) => j.id),
    );
    assert.notEqual(ids[6], a.jobs[6].id);
    const replacement = await db.generationJob.findUniqueOrThrow({
      where: { id: ids[6] },
    });
    const snapshot = replacement.snapshot as any;
    assert.equal(replacement.status, "PENDING");
    assert.equal(snapshot.retryOf, a.jobs[6].id);
    assert.equal(snapshot.configRevision, 12);
    assert.equal(snapshot.imageProvider, "google");
    assert.equal(snapshot.imageModel, configuration.imageModel);
    assert.equal(snapshot.imageQuality, undefined);
    assert.equal(snapshot.imageResolution, undefined);
    assert.equal(snapshot.prompt, "QA instrucciones originales");
    assert.equal(
      (
        await db.generationJob.findUniqueOrThrow({
          where: { id: a.jobs[6].id },
        })
      ).status,
      "UNCERTAIN",
    );
    assert.equal(
      (
        await db.usageLedger.findUniqueOrThrow({
          where: { jobId: a.jobs[6].id },
        })
      ).status,
      "UNCERTAIN",
    );
    assert.equal(
      await db.variation.count({
        where: { jobId: { in: a.jobs.slice(0, 6).map((j) => j.id) } },
      }),
      6,
    );
    assert.equal((await retryOrder(actor, a.order.id, request)).changed, false);
    assert.equal(
      await db.generationJob.count({
        where: {
          idempotencyKey: { startsWith: "order-retry:" + a.order.id + ":" },
        },
      }),
      1,
    );

    const b = await makeOrder(["FAILED", "PENDING"]);
    const attempts = await Promise.allSettled([
      retryOrder(actor, b.order.id, {
        requestId: randomUUID(),
        expectedVersion: b.order.updatedAt.toISOString(),
        confirmCharge: true,
      }),
      retryOrder(actor, b.order.id, {
        requestId: randomUUID(),
        expectedVersion: b.order.updatedAt.toISOString(),
        confirmCharge: true,
      }),
    ]);
    assert.equal(attempts.filter((a) => a.status === "fulfilled").length, 1);
    assert.equal(
      await db.generationJob.count({
        where: {
          idempotencyKey: { startsWith: "order-retry:" + b.order.id + ":" },
        },
      }),
      2,
    );
    assert.equal(
      (
        await db.generationJob.findUniqueOrThrow({
          where: { id: b.jobs[1].id },
        })
      ).status,
      "CANCELLED",
    );
    assert.equal(
      (
        await db.usageLedger.findUniqueOrThrow({
          where: { jobId: b.jobs[1].id },
        })
      ).status,
      "RELEASED",
    );

    const c = await makeOrder(["FAILED", "PENDING"]);
    const source = c.jobs[0];
    await db.generationJob.update({
      where: { id: source.id },
      data: {
        snapshot: {
          ...(source.snapshot as any),
          editVariationId: "qa-locked-variation",
        },
      },
    });
    await db.generationJob.create({
      data: {
        actorId: actor.id,
        projectId: "connection-test",
        idempotencyKey: randomUUID(),
        reservedMicros: 0n,
        snapshot: { editVariationId: "qa-locked-variation" },
      },
    });
    await assert.rejects(
      retryOrder(actor, c.order.id, {
        requestId: randomUUID(),
        expectedVersion: c.order.updatedAt.toISOString(),
        confirmCharge: true,
      }),
      /edición de IA en curso/,
    );
    assert.equal(
      (
        await db.generationJob.findUniqueOrThrow({
          where: { id: c.jobs[1].id },
        })
      ).status,
      "PENDING",
    );
    assert.equal(
      (
        await db.usageLedger.findUniqueOrThrow({
          where: { jobId: c.jobs[1].id },
        })
      ).status,
      "RESERVED",
    );
    assert.deepEqual(
      (
        await db.generationOrder.findUniqueOrThrow({
          where: { id: c.order.id },
        })
      ).jobIds,
      c.jobs.map((j) => j.id),
    );
    assert.equal(
      await db.generationJob.count({
        where: {
          idempotencyKey: { startsWith: "order-retry:" + c.order.id + ":" },
        },
      }),
      0,
    );
    const preview = await makeOrder(["PENDING", "FAILED"]);
    const group = randomUUID();
    for (let index = 0; index < preview.jobs.length; index++) {
      const job = preview.jobs[index];
      await db.generationJob.update({
        where: { id: job.id },
        data: {
          snapshot: {
            ...(job.snapshot as any),
            previewFirst: true,
            approvalGroup: group,
            index: index === 0 ? 1 : 0,
          },
        },
      });
    }
    await retryOrder(actor, preview.order.id, {
      requestId: randomUUID(),
      expectedVersion: preview.order.updatedAt.toISOString(),
      confirmCharge: true,
    });
    const previewOrder = await db.generationOrder.findUniqueOrThrow({
      where: { id: preview.order.id },
    });
    const replacements = await db.generationJob.findMany({
      where: { id: { in: previewOrder.jobIds as string[] } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    assert.equal((replacements[0].snapshot as any).index, 0);
    const { waitingForApproval } = await import("../lib/preview-approval");
    assert.equal(await waitingForApproval(db, replacements[0]), false);
    assert.equal(await waitingForApproval(db, replacements[1]), true);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    if (prior) {
      const { id, ...restore } = prior;
      await db.providerConfiguration.update({
        where: { id },
        data: restore as any,
      });
    } else
      await db.providerConfiguration.deleteMany({ where: { id: "global" } });
    await db.$disconnect();
  }
});
