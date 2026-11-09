import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { db } from "../lib/db";
import { MetaReader } from "../lib/meta-ads/provider";
import {
  createLaunch,
  beginLaunch,
  tickLaunch,
} from "../lib/creative-studio/campaigns";
import { uploadOwnMedia } from "../lib/creative-studio/own-media";
import { remove } from "../lib/storage";

test(
  "Native multianunciante choice is serialized and confirmed before ads",
  { skip: process.env.RUN_CAMPAIGN_CONFIG_QA !== "1" },
  async () => {
    assert.equal(new URL(process.env.DATABASE_URL!).pathname, "/delivery_qa");
    const q = JSON.parse(
      await readFile("/workspace/work/own-media/fixture.json", "utf8"),
    );
    const actor = await db.user.findUniqueOrThrow({ where: { id: q.owner } }),
      category = await db.category.findUniqueOrThrow({
        where: { id: q.category },
      }),
      sub = await db.subproduct.findUniqueOrThrow({ where: { id: q.subs[0] } }),
      prefs = await db.metaWorkspaceSharing.findUnique({
        where: { id: "global" },
      });
    const original = MetaReader.prototype.launchRequest,
      originalFetch = globalThis.fetch;
    const objects = new Map<string, any>(),
      writes: any[] = [],
      drafts: string[] = [];
    let seq = 980000000,
      reject = false;
    globalThis.fetch = async () => {
      throw Error("No real provider calls");
    };
    MetaReader.prototype.launchRequest = async (account, edge, body, id) => {
      if (edge === "object" && !body) {
        const obj = objects.get(id!);
        assert(obj, "Missing fake receipt " + id);
        return reject && obj.object_story_spec
          ? { ...obj, contextual_multi_ads: { enroll_status: "OPT_OUT" } }
          : obj;
      }
      if (edge === "objects")
        return Object.fromEntries(
          id!.split(",").map((key) => [key, objects.get(key)]),
        );
      if (!body) return { data: [{ id: q.pageId, name: "QA" }] };
      writes.push({ edge, body });
      if (edge === "adimages")
        return { images: { qa: { hash: "a".repeat(32) } } };
      const remote = String(++seq);
      objects.set(remote, {
        ...body,
        id: remote,
        account_id: account,
        effective_status: "PAUSED",
      });
      return { id: remote };
    };
    let media: any;
    try {
      await db.metaWorkspaceSharing.upsert({
        where: { id: "global" },
        create: { id: "global", primaryAccountIds: [q.accountId] },
        update: { primaryAccountIds: [q.accountId] },
      });
      const f = new FormData();
      f.set(
        "file",
        new File(
          [await readFile("/workspace/work/own-media/photo.png")],
          "qa.png",
          { type: "image/png" },
        ),
      );
      f.set("requestId", randomUUID());
      f.set("storage", "folder");
      const uploaded = await uploadOwnMedia(
        actor,
        q.subs[0],
        new Request("http://qa/upload", { method: "POST", body: f }),
      );
      media = await db.variation.findUniqueOrThrow({
        where: { id: uploaded.id },
      });
      for (const value of [false, true, "reject"]) {
        reject = value === "reject";
        const config = {
          accountId: q.accountId,
          pageId: q.pageId,
          country: (category.studio as any).country,
          dailyBudget: 15,
          body: "QA",
          headline: "QA",
          objective: "TRAFFIC",
          website: "https://example.invalid",
          platforms: ["facebook"],
          audiences: [{ name: "General" }],
          multiAdvertiser: value !== false,
          targetStatus: "PAUSED",
          planVersion: 2,
        };
        const start = writes.length;
        const draft = await createLaunch(actor, {
          requestId: randomUUID(),
          categoryId: q.category,
          config,
          items: [{ subproductId: q.subs[0], variationIds: [media.id] }],
        });
        drafts.push(draft.id);
        let state = await beginLaunch(actor, draft.id, {
          revision: draft.revision,
          confirmPublish: true,
        });
        for (let i = 0; i < 30 && state.status === "PUBLISHING"; i++)
          state = await tickLaunch(actor, draft.id);
        const actual = writes.slice(start);
        assert.equal(
          actual.find((w) => w.edge === "adcreatives")?.body
            .contextual_multi_ads.enroll_status,
          value === false ? "OPT_OUT" : "OPT_IN",
        );
        if (reject) {
          assert.equal(state.status, "NEEDS_REVIEW", state.error ?? "");
          assert.match(state.error!, /multianunciante/);
          assert(!actual.some((w) => w.edge === "ads"));
          console.log(
            "PASS Meta rejection of OPT_IN stops before creating ads",
          );
        } else {
          assert.equal(state.status, "PUBLISHED", state.error ?? "");
          assert.equal(actual.filter((w) => w.edge === "ads").length, 1);
          console.log(
            "PASS native contextual_multi_ads " +
              (value ? "OPT_IN" : "OPT_OUT") +
              " serialized and verified before paused ads",
          );
        }
      }
    } finally {
      MetaReader.prototype.launchRequest = original;
      globalThis.fetch = originalFetch;
      await db.creativeMetaLaunch.deleteMany({ where: { id: { in: drafts } } });
      await db.category.update({
        where: { id: q.category },
        data: { studio: category.studio as any },
      });
      await db.subproduct.update({
        where: { id: q.subs[0] },
        data: { studio: sub.studio as any },
      });
      if (media) {
        await remove(media.path);
        await db.libraryItem.deleteMany({ where: { variationId: media.id } });
        await db.auditEvent.deleteMany({ where: { resourceId: media.id } });
        await db.variation.delete({ where: { id: media.id } });
        await db.generationJob.delete({ where: { id: media.jobId } });
      }
      if (prefs)
        await db.$executeRaw`UPDATE "MetaWorkspaceSharing" SET "primaryAccountIds"=${prefs.primaryAccountIds ? JSON.stringify(prefs.primaryAccountIds) : null}::jsonb WHERE id='global'`;
      else
        await db.metaWorkspaceSharing.deleteMany({ where: { id: "global" } });
      await db.$disconnect();
    }
  },
);
