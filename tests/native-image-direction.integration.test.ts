import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { db } from "../lib/db";
import { encryptKey } from "../lib/crypto";
import { reserveJobs } from "../lib/ai";
import { runOne } from "../scripts/worker";
import { latestConnectionTest } from "../lib/provider-settings";

test("full worker: a Google creative 404 publishes the native image, ledger and recovery warning once", async () => {
  assert.match(process.env.DATABASE_URL ?? "", /localhost:55439\/delivery_qa/);
  const original = globalThis.fetch;
  const prior = await db.providerConfiguration.findUnique({
    where: { id: "global" },
  });
  const actor = await db.user.create({
    data: {
      email: `native-worker-${randomUUID()}@example.invalid`,
      name: "Synthetic QA",
      passwordHash: "no-login-qa",
      role: "OWNER",
      status: "APPROVED",
    },
  });
  const imageModel = "gemini-3-pro-image-preview";
  const models = [
    {
      id: imageModel,
      kind: "image",
      qualities: ["default"],
      resolutions: ["1K"],
      supportsReferences: true,
    },
    { id: "gemini-2.5-pro", kind: "creative", qualities: [], resolutions: [] },
  ];
  const configuration = {
    provider: "google",
    imageModel,
    creativeProvider: "google",
    creativeModel: "gemini-2.5-pro",
    quality: "default",
    resolution: "1K",
    models,
    encryptedKey: encryptKey("synthetic-key-no-paid-account"),
    status: "VERIFIED",
    revision: 41,
    verifiedRevision: 41,
    verifiedAt: new Date(),
  };
  const png = await sharp({
    create: { width: 64, height: 64, channels: 3, background: "white" },
  })
    .png()
    .toBuffer();
  let calls = 0;
  globalThis.fetch = async (url, init) => {
    calls++;
    const endpoint = String(url);
    if (endpoint.endsWith("/models/gemini-2.5-pro:generateContent")) {
      assert.equal(calls, 1);
      return Response.json(
        { error: { status: "NOT_FOUND", message: "PRIVATE_UPSTREAM_ERROR" } },
        { status: 404 },
      );
    }
    assert(endpoint.endsWith(`/models/${imageModel}:generateContent`));
    assert.equal(calls, 2);
    const body = JSON.parse(String(init?.body));
    assert(body.contents[0].parts[0].text.includes("INSTRUCCION ORIGINAL QA"));
    assert(!JSON.stringify(body).includes("PRIVATE_UPSTREAM_ERROR"));
    return Response.json({
      candidates: [
        {
          content: {
            parts: [
              {
                inlineData: {
                  mimeType: "image/png",
                  data: png.toString("base64"),
                },
              },
            ],
          },
        },
      ],
      usageMetadata: { totalTokenCount: 100 },
    });
  };
  try {
    await db.providerConfiguration.upsert({
      where: { id: "global" },
      create: { id: "global", ...configuration },
      update: configuration,
    });
    const [job] = await reserveJobs(
      actor.id,
      "connection-test",
      [
        {
          key: randomUUID(),
          snapshot: {
            prompt: "INSTRUCCION ORIGINAL QA: paisaje ambiental",
            mode: "Imagen",
            format: "1:1",
            index: 0,
            renderMode: "flat",
            reasoningLevel: "medium",
          },
        },
      ],
      41,
    );
    assert.equal(await runOne({ id: job.id }), true);
    const completed = await db.generationJob.findUniqueOrThrow({
      where: { id: job.id },
      include: { variation: true },
    });
    assert.equal(
      completed.status,
      "COMPLETED",
      completed.error ?? "worker did not complete",
    );
    assert.equal((completed.snapshot as any).creativeUnavailable, true);
    assert(completed.variation);
    assert.equal(completed.variation.model, imageModel);
    const ledger = await db.usageLedger.findUniqueOrThrow({
      where: { jobId: job.id },
    });
    assert.equal(ledger.status, "CONSUMED_ESTIMATE");
    assert.equal((ledger.usage as any).creative, null);
    assert.equal((ledger.usage as any).image.totalTokenCount, 100);
    const latest = await latestConnectionTest();
    assert.match(latest!.warning ?? "", /instrucciones originales/);
    assert.equal(await runOne({ id: job.id }), false);
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = original;
    if (prior) {
      const { id, ...restore } = prior;
      await db.providerConfiguration.update({
        where: { id },
        data: restore as any,
      });
    } else await db.providerConfiguration.deleteMany({ where: { id: "global" } });
    await db.$disconnect();
  }
});
