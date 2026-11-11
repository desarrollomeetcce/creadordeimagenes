import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "../lib/db";
import { encryptKey } from "../lib/crypto";
import { saveStudioProject } from "../lib/creative-studio/service";
import { generateBatch } from "../lib/generation";
test("provider changes allow project saving and snapshot only supported current image parameters without external calls", async () => {
  assert.match(process.env.DATABASE_URL ?? "", /localhost:55439\/delivery_qa/);
  const previous = await db.providerConfiguration.findUnique({
    where: { id: "global" },
  });
  const actor = await db.user.create({
    data: {
      email: `image-switch-${randomUUID()}@example.invalid`,
      name: "Synthetic switch QA",
      passwordHash: "synthetic-no-login",
      role: "OWNER",
      status: "APPROVED",
    },
  });
  const project = await db.project.create({
    data: {
      ownerId: actor.id,
      name: "Provider switch QA",
      prompt: "QA",
      studio: { settings: { quality: "medium", resolution: "1024x1024" } },
    },
  });
  const category = await db.category.create({
    data: { projectId: project.id, name: "QA" },
  });
  const sub = await db.subproduct.create({
    data: { categoryId: category.id, name: "QA image" },
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw Error("No real AI calls in provider-switch QA");
  };
  try {
    for (const provider of ["google", "fal", "replicate"]) {
      const image = {
        id: `${provider}-synthetic-image`,
        kind: "image",
        qualities: ["default"],
        resolutions: ["2K"],
      };
      const data = {
        provider,
        models: [
          image,
          {
            id: "synthetic-creative",
            kind: "creative",
            qualities: [],
            resolutions: [],
          },
        ],
        imageModel: image.id,
        creativeModel: "synthetic-creative",
        creativeProvider: provider,
        quality: "default",
        resolution: "2K",
        encryptedKey: encryptKey("synthetic-no-real-provider-key"),
        status: "VERIFIED",
        revision: 500,
        verifiedRevision: 500,
        verifiedAt: new Date(),
      };
      await db.providerConfiguration.upsert({
        where: { id: "global" },
        create: { id: "global", ...data },
        update: data,
      });
      const saved = await saveStudioProject(actor, project.id, {
        prompt: "QA",
        settings: {
          quality: "medium",
          resolution: "1024x1024",
          count: 2,
          format: "4:5",
        },
      });
      const settings = (saved.studio as any).settings;
      assert.equal(settings.quality, undefined);
      assert.equal(settings.resolution, undefined);
      assert.equal(settings.count, 2);
      assert.equal(settings.format, "4:5");
      const jobs = await generateBatch(
        actor.id,
        category.id,
        randomUUID(),
        [sub.id],
        false,
        "ai",
        {
          projectOnly: true,
          count: 1,
          mode: "Imagen + Texto",
          format: "1:1",
          quality: "medium",
          resolution: "1024x1024",
        },
      );
      assert.equal(jobs.length, 1);
      const job = await db.generationJob.findUniqueOrThrow({
        where: { id: jobs[0].id },
      });
      const snapshot = job.snapshot as any;
      assert.equal(snapshot.imageProvider, provider);
      assert.equal(snapshot.imageModel, image.id);
      assert.equal(snapshot.imageQuality, "default");
      assert.equal(snapshot.imageResolution, "2K");
      assert.equal(job.status, "PENDING");
    }
  } finally {
    globalThis.fetch = originalFetch;
    await db.usageLedger.deleteMany({ where: { actorId: actor.id } });
    await db.generationJob.deleteMany({ where: { projectId: project.id } });
    await db.subproduct.delete({ where: { id: sub.id } });
    await db.category.delete({ where: { id: category.id } });
    await db.project.delete({ where: { id: project.id } });
    await db.user.delete({ where: { id: actor.id } });
    if (previous) {
      const { id, models, alternatives, ...rest } = previous;
      await db.providerConfiguration.update({
        where: { id },
        data: {
          ...rest,
          models: models as Prisma.InputJsonValue,
          alternatives: alternatives as Prisma.InputJsonValue,
        },
      });
    } else await db.providerConfiguration.delete({ where: { id: "global" } });
    await db.$disconnect();
  }
});
