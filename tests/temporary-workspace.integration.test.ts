import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import sharp from "sharp";

test(
  "temporary campaign preparation stays out of folders and keeps normal retention separate",
  { skip: process.env.RUN_TEMPORARY_WORKSPACE_QA !== "1" },
  async () => {
    assert.equal(new URL(process.env.DATABASE_URL!).pathname, "/delivery_qa");
    const { db } = await import("../lib/db");
    const { prepareTemporaryWorkspace } =
      await import("../lib/creative-studio/temporary-workspace");
    const {
      createStudioProject,
      createStudioProduct,
      studioProject,
      addStudioItems,
      studioImages,
      saveStudioImages,
    } = await import("../lib/creative-studio/service");
    const { quickStartOptions } = await import("../lib/quick-start");
    const { libraryTree } = await import("../lib/library-explorer");
    const { uploadOwnMedia } = await import("../lib/creative-studio/own-media");
    const { remove } = await import("../lib/storage");
    const actor = await db.user.create({
      data: {
        email: randomUUID() + "@example.invalid",
        name: "Temporary QA",
        passwordHash: "synthetic",
        role: "OWNER",
        status: "APPROVED",
      },
    });
    const stranger = await db.user.create({
      data: {
        email: randomUUID() + "@example.invalid",
        name: "Other QA",
        passwordHash: "synthetic",
        role: "USER",
        status: "APPROVED",
      },
    });
    const project = await createStudioProject(actor, {
      name: "Temporary QA " + randomUUID(),
      requestId: randomUUID(),
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      throw Error("No provider calls allowed in temporary QA");
    };
    const png = await sharp({
      create: { width: 20, height: 20, channels: 3, background: "white" },
    })
      .png()
      .toBuffer();
    const request = (storage = "campaign", requestId = randomUUID()) => {
      const f = new FormData();
      f.set(
        "file",
        new File([new Uint8Array(png)], "own.png", { type: "image/png" }),
      );
      f.set("storage", storage);
      f.set("requestId", requestId);
      return new Request("http://qa/upload", { method: "POST", body: f });
    };
    try {
      const b = { country: "UY", requestId: randomUUID() };
      const [one, two] = await Promise.all([
        prepareTemporaryWorkspace(actor, project.id, b),
        prepareTemporaryWorkspace(actor, project.id, b),
      ]);
      assert.equal(one.id, two.id);
      assert.equal(one.campaignTemporary, true);
      assert.equal(
        await db.category.count({
          where: { projectId: project.id, campaignTemporary: true },
        }),
        1,
      );
      await assert.rejects(
        prepareTemporaryWorkspace(actor, project.id, { ...b, country: "CO" }),
        /solicitud/,
      );
      await assert.rejects(prepareTemporaryWorkspace(stranger, project.id, b));
      await assert.rejects(
        prepareTemporaryWorkspace(actor, project.id, {
          ...b,
          country: "invented",
        }),
      );
      assert(
        !(await studioProject(actor, project.id)).categories.some(
          (c) => c.id === one.id,
        ),
      );
      assert(
        !(await quickStartOptions(actor))
          .find((p) => p.id === project.id)!
          .categories.some((c) => c.id === one.id),
      );
      const [sub] = await addStudioItems(actor, one.id, {
        names: ["Tratamiento de aguas"],
      });
      assert(
        !(await libraryTree(actor)).some(
          (n) =>
            n.id === "product:" + one.id || n.id === "subproduct:" + sub.id,
        ),
      );
      const token = randomUUID();
      const uploaded = await uploadOwnMedia(
        actor,
        sub.id,
        request("campaign", token),
      );
      assert.equal(
        (await uploadOwnMedia(actor, sub.id, request("campaign", token))).id,
        uploaded.id,
      );
      const variation = await db.variation.findUniqueOrThrow({
        where: { id: uploaded.id },
      });
      const { accessibleVariation } = await import("../lib/versions");
      assert.equal(
        (await accessibleVariation(actor, variation.id)).id,
        variation.id,
      );
      assert.equal(variation.permanent, false);
      assert.equal(variation.ownResource, true);
      assert(
        Math.abs(variation.expiresAt.getTime() - Date.now() - 86400000) < 20000,
      );
      assert.equal((await studioImages(actor, sub.id, 1)).items.length, 1);
      assert.equal(
        await db.usageLedger.count({ where: { jobId: variation.jobId } }),
        0,
      );
      assert.equal(
        await db.imageVersion.count({ where: { variationId: variation.id } }),
        0,
      );
      await assert.rejects(
        uploadOwnMedia(actor, sub.id, request("folder")),
        /carpeta/,
      );
      await assert.rejects(
        saveStudioImages(actor, { ids: [variation.id] }),
        /carpeta/,
      );
      assert.equal(
        (await db.variation.findUniqueOrThrow({ where: { id: variation.id } }))
          .permanent,
        false,
      );
      const folder = await createStudioProduct(actor, project.id, {
        name: "Uruguay",
        country: "UY",
        requestId: randomUUID(),
      });
      const [keptSub] = await addStudioItems(actor, folder.id, {
        names: ["Tratamiento de aguas"],
      });
      const kept = await uploadOwnMedia(actor, keptSub.id, request("folder"));
      assert.equal(
        (await db.variation.findUniqueOrThrow({ where: { id: kept.id } }))
          .permanent,
        true,
      );
      assert(
        (await libraryTree(actor)).some(
          (n) => n.id === "subproduct:" + keptSub.id,
        ),
      );
      await db.variation.update({
        where: { id: variation.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      assert.equal((await studioImages(actor, sub.id, 1)).items.length, 0);
    } finally {
      globalThis.fetch = originalFetch;
      const jobs = await db.generationJob.findMany({
          where: { projectId: project.id },
          select: { id: true },
        }),
        jobIds = jobs.map((j) => j.id);
      const variations = await db.variation.findMany({
        where: { jobId: { in: jobIds } },
        select: { id: true, path: true },
      });
      for (const v of variations) await remove(v.path);
      await db.libraryItem.deleteMany({
        where: { variationId: { in: variations.map((v) => v.id) } },
      });
      await db.variation.deleteMany({ where: { jobId: { in: jobIds } } });
      await db.generationJob.deleteMany({ where: { id: { in: jobIds } } });
      await db.subproduct.deleteMany({
        where: { category: { projectId: project.id } },
      });
      await db.category.deleteMany({ where: { projectId: project.id } });
      await db.project.delete({ where: { id: project.id } });
      await db.auditEvent.deleteMany({ where: { actorId: actor.id } });
      await db.user.deleteMany({
        where: { id: { in: [actor.id, stranger.id] } },
      });
      await db.$disconnect();
    }
  },
);
