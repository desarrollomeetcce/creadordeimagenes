import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { randomUUID, createHash } from "node:crypto";
import sharp from "sharp";
import JSZip from "jszip";
import { exportCollection } from "../lib/collections";
import { db } from "../lib/db";
import { encryptKey } from "../lib/crypto";
import {
  uploadOwnMedia,
  validateOwnMedia,
} from "../lib/creative-studio/own-media";
import { studioImages } from "../lib/creative-studio/service";
import { listAuditThumbnails } from "../lib/visual-audit";
import {
  createLaunch,
  beginLaunch,
  tickLaunch,
} from "../lib/creative-studio/campaigns";
import { MetaReader } from "../lib/meta-ads/provider";
import { cleanupStorage } from "../lib/cleanup";
import { load } from "../lib/storage";
import { videoResponse } from "../lib/creative-studio/media-response";

test(
  "Own photos/video stay in their folders, use no AI/audit thumbnails, and reach verified paused Meta ads without duplicate video upload",
  { skip: !process.env.DATABASE_URL?.endsWith("/delivery_qa") },
  async () => {
    process.env.AI_MASTER_KEY ??= Buffer.alloc(32, 7).toString("base64");
    const tag = randomUUID(),
      owner = await db.user.create({
        data: {
          name: "Own media QA",
          email: tag + "@example.test",
          passwordHash: "synthetic",
          role: "OWNER",
          status: "APPROVED",
        },
      }),
      actor = owner;
    const other = await db.user.create({
      data: {
        name: "No folder access",
        email: "other" + tag + "@example.test",
        passwordHash: "synthetic",
        role: "USER",
        status: "APPROVED",
      },
    });
    const project = await db.project.create({
        data: { name: "Recursos propios " + tag, ownerId: owner.id },
      }),
      cat = await db.category.create({
        data: {
          projectId: project.id,
          name: "Colombia",
          studio: { country: "CO" },
        },
      });
    const subs = await Promise.all(
      ["Inteligencia artificial", "Tratamiento de aguas"].map((name) =>
        db.subproduct.create({
          data: { name, categoryId: cat.id, studio: { folderPending: true } },
        }),
      ),
    );
    const png = await sharp({
        create: { width: 160, height: 160, channels: 3, background: "#14685f" },
      })
        .png()
        .toBuffer(),
      video = await readFile("/workspace/work/own-media/video.mp4");
    const upload = (
      sub: string,
      bytes: Buffer,
      name: string,
      storage = "campaign",
      requestId = randomUUID(),
      who = actor,
    ) => {
      const form = new FormData();
      form.set("file", new File([new Uint8Array(bytes)], name));
      form.set("requestId", requestId);
      form.set("storage", storage);
      return uploadOwnMedia(
        who,
        sub,
        new Request("http://localhost/api/creative-studio/upload/" + sub, {
          method: "POST",
          body: form,
        }),
      );
    };
    const request = randomUUID(),
      photo = await upload(subs[0].id, png, "imagen.png", "folder", request),
      clip = await upload(subs[1].id, video, "video.mp4");
    assert.equal(
      (await upload(subs[0].id, png, "imagen.png", "folder", request)).id,
      photo.id,
    );
    await assert.rejects(
      upload(subs[1].id, png, "imagen.png", "folder", request),
      /ya se usó/,
    );
    await assert.rejects(
      upload(subs[0].id, png, "image.png", "campaign", randomUUID(), other),
      /acceso|permiso/,
    );
    await assert.rejects(
      validateOwnMedia(new File(["not video"], "test.mp4")),
      /válido/,
    );
    await assert.rejects(
      validateOwnMedia(new File(["text"], "test.txt")),
      /Usa PNG/,
    );
    const jpeg = await upload(
      subs[0].id,
      await sharp(png).jpeg().toBuffer(),
      "foto.jpg",
      "folder",
    );
    const checkedWebp = await validateOwnMedia(
      new File(
        [new Uint8Array(await sharp(png).webp().toBuffer())],
        "foto.webp",
      ),
    );
    assert.equal(checkedWebp.mime, "image/webp");
    const archive = await JSZip.loadAsync(
      await (
        await exportCollection(actor, {
          ids: [jpeg.id, clip.id],
          format: "png",
        })
      ).arrayBuffer(),
    );
    const names = Object.keys(archive.files).filter(
      (n) => !archive.files[n].dir,
    );
    assert.equal(names.length, 2);
    const movie = names.find((n) => n.endsWith(".mp4"))!,
      picture = names.find((n) => n.endsWith(".png"))!;
    assert(movie && picture);
    assert.deepEqual(await archive.files[movie].async("nodebuffer"), video);
    assert.equal(
      (await sharp(await archive.files[picture].async("nodebuffer")).metadata())
        .format,
      "png",
    );
    const p = await db.variation.findUniqueOrThrow({ where: { id: photo.id } }),
      v = await db.variation.findUniqueOrThrow({ where: { id: clip.id } });
    assert.equal(p.permanent, true);
    assert.equal(v.permanent, false);
    assert.equal(v.mediaType, "VIDEO");
    assert.equal(v.subproductId, subs[1].id);
    assert(v.expiresAt.getTime() > Date.now() + 23 * 3600000);
    assert.equal(
      await db.imageVersion.count({
        where: { variationId: { in: [p.id, v.id] } },
      }),
      0,
    );
    assert.equal(
      await db.auditThumbnail.count({
        where: { variationId: { in: [p.id, v.id] } },
      }),
      0,
    );
    assert.equal(
      await db.usageLedger.count({ where: { actorId: owner.id } }),
      0,
    );
    assert(
      (await studioImages(actor, subs[1].id)).items.some(
        (i) => i.id === v.id && i.mediaType === "VIDEO",
      ),
    );
    const audit = await listAuditThumbnails(
      actor,
      new URLSearchParams({ q: "video.mp4" }),
    );
    assert(
      audit.ownUploads.some((e) => (e.detail as any).file === "video.mp4"),
    );
    const ranged = videoResponse(video, "video/mp4", "bytes=2-9", v.id);
    assert.equal(ranged.status, 206);
    assert.equal((await ranged.arrayBuffer()).byteLength, 8);
    assert.equal(
      videoResponse(video, "video/mp4", "bytes=999999999-", v.id).status,
      416,
    );
    const connection = await db.metaConnection.create({
        data: {
          name: "Own fake Meta",
          ownerId: owner.id,
          transport: "API",
          verifiedAt: new Date(),
        },
      }),
      accountId = String(Date.now()) + "77",
      pageId = "5556600001";
    await db.metaConnection.update({
      where: { id: connection.id },
      data: {
        encryptedToken: encryptKey(
          "synthetic-never-sent",
          "meta:" + connection.id,
        ),
      },
    });
    await db.metaAdAccount.create({
      data: {
        id: accountId,
        connectionId: connection.id,
        name: "Own media QA",
        currency: "PEN",
        timezone: "America/Lima",
      },
    });
    await db.metaWorkspaceSharing.upsert({
      where: { id: "global" },
      create: { primaryAccountIds: [accountId] },
      update: { primaryAccountIds: [accountId] },
    });
    const original = MetaReader.prototype.launchRequest,
      fetch = globalThis.fetch,
      objects = new Map<string, any>();
    let seq = Date.now() * 100,
      uploads = 0,
      checks = 0;
    globalThis.fetch = async () => {
      throw Error("No real provider during own-media QA");
    };
    MetaReader.prototype.launchRequest = async function (
      account,
      edge,
      body,
      id,
      fields,
    ) {
      assert.equal(account, accountId);
      if (["pages", "promote_pages", "assigned_pages"].includes(edge))
        return { data: [{ id: pageId, name: "QA page" }] };
      if (edge === "saved_audiences") return { data: [] };
      if (edge === "adimages")
        return { images: { x: { hash: "b".repeat(32) } } };
      if (edge === "advideos") {
        assert(body?.source instanceof Blob);
        assert.equal(body.source.size, video.length);
        uploads++;
        return { id: "955500001" };
      }
      if (edge === "objects")
        return Object.fromEntries(
          id!.split(",").map((i) => [i, objects.get(i)]),
        );
      if (edge === "object" && fields === "id,status,picture") {
        checks++;
        return {
          id,
          status: { video_status: checks === 1 ? "processing" : "ready" },
          picture: "https://video.fbcdn.net/cover.jpg",
        };
      }
      if (edge === "object") {
        assert(!body, "Paused test must never activate");
        return objects.get(id!);
      }
      assert(body);
      const newId = String(++seq);
      objects.set(newId, {
        ...body,
        id: newId,
        account_id: account,
        effective_status: "PAUSED",
      });
      return { id: newId };
    };
    try {
      const draft = await createLaunch(actor, {
        requestId: randomUUID(),
        categoryId: cat.id,
        config: {
          accountId,
          pageId,
          country: "CO",
          objective: "TRAFFIC",
          website: "https://example.org",
          dailyBudget: 10,
          body: "Información {diplomado}",
          headline: "Título exacto {diplomado}",
          description: "Descripción exacta",
          platforms: ["facebook"],
          audiences: [{ name: "Público" }],
        },
        items: [
          { subproductId: subs[0].id, variationIds: [p.id] },
          { subproductId: subs[1].id, variationIds: [v.id] },
        ],
      });
      let state = await beginLaunch(actor, draft.id, {
        revision: draft.revision,
        confirmPublish: true,
      });
      let limit = 0;
      while (state.status === "PUBLISHING" && ++limit < 60) {
        state = await tickLaunch(actor, draft.id);
        if (state.waitReason === "processing") {
          const before = checks;
          await tickLaunch(actor, draft.id);
          assert.equal(
            checks,
            before,
            "No reads before durable processing deadline",
          );
          const saved = await db.creativeMetaLaunch.findUniqueOrThrow({
              where: { id: draft.id },
            }),
            steps = saved.steps as any[];
          steps.find((s) => s.kind === "VIDEO_READY").wait.until = new Date(
            Date.now() - 1000,
          ).toISOString();
          await db.creativeMetaLaunch.update({
            where: { id: draft.id },
            data: { steps },
          });
        }
      }
      assert.equal(state.status, "PUBLISHED", state.error ?? undefined);
      assert.equal(uploads, 1);
      assert.equal(checks, 2);
      const creative = [...objects.values()].find(
        (o) => o.object_story_spec?.video_data,
      );
      assert(creative);
      assert.equal(creative.object_story_spec.video_data.video_id, "955500001");
      assert.equal(
        creative.object_story_spec.video_data.title,
        "Título exacto Tratamiento de aguas",
      );
      assert.equal(
        creative.object_story_spec.video_data.link_description,
        "Descripción exacta",
      );
      assert(!creative.object_story_spec.link_data);
      assert(
        (await db.variation.findUniqueOrThrow({ where: { id: v.id } }))
          .expiresAt <= new Date(),
      );
      await cleanupStorage();
      await assert.rejects(load(v.path));
      assert.deepEqual(await load(p.path), png);
      assert.equal(
        await db.usageLedger.count({ where: { actorId: owner.id } }),
        0,
      );
      const session = randomUUID();
      await db.session.create({
        data: {
          id: createHash("sha256").update(session).digest("hex"),
          userId: owner.id,
          expiresAt: new Date(Date.now() + 3600000),
        },
      });
      await writeFile(
        "/workspace/work/own-media/fixture.json",
        JSON.stringify({
          owner: owner.id,
          project: project.id,
          category: cat.id,
          subs: subs.map((s) => s.id),
          session,
          accountId,
          pageId,
        }),
      );
      console.log(
        "PASS actual PNG/MP4 validation, own folder scopes, upload replay, no AI/versions/thumbnails, metadata audit, video ranges, multipart plan, processing wait, exact verified creative, paused Meta receipts and temporary cleanup",
      );
    } finally {
      MetaReader.prototype.launchRequest = original;
      globalThis.fetch = fetch;
      await db.$disconnect();
    }
  },
);
