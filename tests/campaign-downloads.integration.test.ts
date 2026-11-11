import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import JSZip from "jszip";
import { db } from "../lib/db";
import { store } from "../lib/storage";
import {
  libraryDownloadIds,
  exportLibrarySelection,
} from "../lib/library-downloads";
import { exportCollection } from "../lib/collections";
import { campaignAudit } from "../lib/campaign-audit";

test("folder ZIP scope, off-page selection, permissions and successful campaign audit use only local data", async () => {
  assert.match(process.env.DATABASE_URL ?? "", /localhost:55439\/delivery_qa/);
  const originalFetch = globalThis.fetch;
  let externalCalls = 0;
  globalThis.fetch = async () => {
    externalCalls++;
    throw Error("No external API in QA");
  };
  try {
    const owner = await db.user.create({
      data: {
        email: randomUUID() + "@example.invalid",
        name: "QA OWNER",
        passwordHash: "no-login",
        role: "OWNER",
        status: "APPROVED",
      },
    });
    const user = await db.user.create({
      data: {
        email: randomUUID() + "@example.invalid",
        name: "QA USER",
        passwordHash: "no-login",
        role: "USER",
        status: "APPROVED",
      },
    });
    const project = await db.project.create({
      data: { name: "QA project", ownerId: owner.id },
    });
    const category = await db.category.create({
      data: { name: "QA country", projectId: project.id },
    });
    const a = await db.subproduct.create({
      data: { name: "Gestión de restaurantes", categoryId: category.id },
    });
    const b = await db.subproduct.create({
      data: { name: "Otro producto", categoryId: category.id },
    });
    const bytes = await sharp({
      create: { width: 8, height: 8, channels: 3, background: "white" },
    })
      .png()
      .toBuffer();
    const path = await store(bytes);
    const images: string[] = [];
    for (let i = 0; i < 28; i++) {
      const subproductId = i === 27 ? b.id : a.id;
      const job = await db.generationJob.create({
        data: {
          actorId: owner.id,
          projectId: project.id,
          subproductId,
          idempotencyKey: randomUUID(),
          snapshot: {},
          status: "COMPLETED",
          reservedMicros: 0n,
        },
      });
      const image = await db.variation.create({
        data: {
          jobId: job.id,
          subproductId,
          path,
          model: "qa-native-image",
          permanent: true,
          expiresAt: new Date(Date.now() + 86400000),
        },
      });
      images.push(image.id);
    }
    const subIds = await libraryDownloadIds(owner, ["n:subproduct:" + a.id]);
    assert.equal(subIds.length, 27);
    assert(!subIds.includes(images[27]));
    const parent = await db.libraryFolder.create({
      data: { userId: owner.id, name: "QA personal" },
    });
    const child = await db.libraryFolder.create({
      data: { userId: owner.id, name: "QA nested", parentId: parent.id },
    });
    const copy = await db.libraryImageCopy.create({
      data: {
        userId: owner.id,
        variationId: images[26],
        destinationKey: "folder:" + child.id,
      },
    });
    const nested = await libraryDownloadIds(owner, [
      "n:folder:" + parent.id,
      "c:" + copy.id,
      "v:" + images[26],
    ]);
    assert.deepEqual(nested, [images[26]]);
    const download = await exportLibrarySelection(owner, {
      selection: ["v:" + images[0], "v:" + images[26]],
      format: "png",
    });
    const zip = await JSZip.loadAsync(
      Buffer.from(await download.arrayBuffer()),
    );
    assert.equal(
      Object.values(zip.files).filter((file) => !file.dir).length,
      2,
    );
    await assert.rejects(
      exportCollection(owner, {
        ids: [images[0], images[27]],
        subproductId: a.id,
        format: "png",
      }),
      /otro producto/,
    );
    await assert.rejects(
      libraryDownloadIds(user, ["n:subproduct:" + a.id]),
      /no está disponible/,
    );
    await assert.rejects(
      exportLibrarySelection(user, {
        selection: ["v:" + images[0]],
        format: "png",
      }),
    );
    await assert.rejects(
      libraryDownloadIds(user, ["c:" + copy.id]),
      /no está disponible/,
    );
    const makeLaunch = (status: string) =>
      db.creativeMetaLaunch.create({
        data: {
          actorId: owner.id,
          projectId: project.id,
          categoryId: category.id,
          requestId: randomUUID(),
          accountId: "12345",
          connectionId: "synthetic-only",
          connectionRevision: 1,
          status,
          config: {
            country: "MX",
            campaignName: "[pais] - [diplomado]",
            primaryText: "PRIVATE_TEXT_MUST_NOT_LEAK",
            variationRevisions: { secret: 99 },
          },
          campaigns: [
            {
              subproductId: a.id,
              name: a.name,
              variationIds: images.slice(0, 2),
            },
          ],
          steps: [
            {
              kind: "CAMPAIGN",
              state: "DONE",
              campaign: 0,
              receipt: { id: "111" },
            },
            {
              kind: "ADSET",
              state: "DONE",
              campaign: 0,
              receipt: { id: "222" },
            },
            {
              kind: "AD",
              state: "DONE",
              campaign: 0,
              receipt: { id: "333", private: "PRIVATE_RECEIPT" },
            },
          ],
        },
      });
    const published = await makeLaunch("PUBLISHED");
    const failed = await makeLaunch("NEEDS_REVIEW");
    const draft = await makeLaunch("DRAFT");
    const audit = await campaignAudit(owner, new URLSearchParams());
    const row = audit.items.find((item) =>
      item.key.startsWith(published.id + ":"),
    );
    assert(row);
    assert.equal(row.name, "México - Gestión de restaurantes");
    assert.equal(row.adsetCount, 1);
    assert.equal(row.adCount, 1);
    assert(
      !audit.items.some(
        (item) =>
          item.key.startsWith(failed.id + ":") ||
          item.key.startsWith(draft.id + ":"),
      ),
    );
    assert(!JSON.stringify(audit).includes("PRIVATE"));
    assert(!JSON.stringify(audit).includes(images[0]));
    await assert.rejects(campaignAudit(user, new URLSearchParams()));
    await db.user.update({
      where: { id: owner.id },
      data: { status: "SUSPENDED" },
    });
    await assert.rejects(
      campaignAudit(owner, new URLSearchParams()),
      /ya no tiene acceso/,
    );
    assert.equal(externalCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    await db.$disconnect();
  }
});
