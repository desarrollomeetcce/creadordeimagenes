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
import { suggestCampaign } from "../lib/creative-studio/campaign-suggestion";
import { adapter } from "../lib/providers";
import { Prisma } from "@prisma/client";
test("Campaign objectives reach verified paused objects with exact distribution, budget and common headline; no external calls", async () => {
  assert(/studio_columns_qa_\d+/.test(process.env.DATABASE_URL ?? ""));
  const q = JSON.parse(
    await readFile("/workspace/work/studio-columns-fixture.json", "utf8"),
  );
  const owner = await db.user.findUniqueOrThrow({
      where: { id: q.users[0].id },
    }),
    category = await db.category.findUniqueOrThrow({
      where: { id: q.productId },
    });
  await db.rateLimit.upsert({
    where: { key: "creative-meta:" + owner.id },
    create: {
      key: "creative-meta:" + owner.id,
      count: 120,
      expiresAt: new Date(Date.now() + 900000),
    },
    update: { count: 120, expiresAt: new Date(Date.now() + 900000) },
  });
  const old = MetaReader.prototype.launchRequest,
    fetch = globalThis.fetch;
  let seq = 9908800000;
  const objects = new Map<string, any>(),
    calls: any[] = [],
    drafts: string[] = [];
  globalThis.fetch = async () => {
    throw Error("External transport blocked");
  };
  MetaReader.prototype.launchRequest = async function (
    account,
    edge,
    body,
    id,
    fields,
  ) {
    assert.equal(account, q.accountId);
    calls.push({ edge, body, id });
    if (edge === "promote_pages")
      return { data: [{ id: q.pageId, name: "QA" }] };
    if (edge === "saved_audiences") return { data: [] };
    if (edge === "object" && fields?.includes("leadgen_forms"))
      return {
        id,
        leadgen_forms: {
          data: [
            { id: "556677", name: "QA leads", status: "ACTIVE" },
            { id: "556678", name: "Archived", status: "ARCHIVED" },
          ],
        },
      };
    if (edge === "adimages")
      return { images: { qa: { hash: "b".repeat(32) } } };
    if (edge === "objects")
      return Object.fromEntries(
        id!.split(",").map((id) => [id, objects.get(id)]),
      );
    if (edge === "object") {
      const obj = objects.get(id!);
      assert(obj);
      if (body) {
        Object.assign(obj, body);
        return { success: true };
      }
      return obj;
    }
    assert(body);
    const created = String(++seq);
    objects.set(created, {
      ...body,
      id: created,
      account_id: account,
      effective_status: "PAUSED",
    });
    return { id: created };
  };
  try {
    for (const objective of ["WHATSAPP", "LEADS", "TRAFFIC"]) {
      const start = calls.length;
      const images = q.images
        .filter((i: any) => i.subId === q.images[0].subId)
        .slice(0, 2);
      assert.equal(images.length, 2);
      const d = await createLaunch(owner, {
        requestId: randomUUID(),
        categoryId: q.productId,
        config: {
          accountId: q.accountId,
          pageId: q.pageId,
          country: "UY",
          objective,
          whatsapp: "",
          leadFormId: objective === "LEADS" ? "556677" : "",
          website: objective === "TRAFFIC" ? "https://example.org" : "",
          dailyBudget: 12,
          body: "Solicita {diplomado}",
          headline: "Accede {diplomado} ★★★★★",
          platforms: ["facebook"],
          audiences: [{ name: "A" }, { name: "B" }],
        },
        items: [
          {
            subproductId: images[0].subId,
            variationIds: images.map((i: any) => i.id),
          },
        ],
      });
      drafts.push(d.id);
      assert.equal(d.summary.ads, 2);
      let state = await beginLaunch(owner, d.id, {
        revision: d.revision,
        confirmPublish: true,
      });
      for (let i = 0; i < 25 && state.status === "PUBLISHING"; i++)
        state = await tickLaunch(owner, d.id);
      assert.equal(state.status, "PUBLISHED", JSON.stringify(state));
      const sent = calls.slice(start);
      assert.equal(sent.filter((c) => c.edge === "ads").length, 2);
      assert.equal(sent.filter((c) => c.edge === "adsets").length, 2);
      assert(
        sent
          .filter((c) => c.edge === "adsets")
          .every(
            (c) =>
              JSON.stringify(c.body.targeting.publisher_platforms) ===
                '["facebook"]' && !("daily_budget" in c.body),
          ),
      );
      assert.equal(
        sent.find((c) => c.edge === "campaigns").body.daily_budget,
        1200,
      );
      const headlines = sent
        .filter((c) => c.edge === "adcreatives")
        .map((c) => c.body.object_story_spec.link_data.name);
      assert.equal(new Set(headlines).size, 1);
      const whatsappSet = sent.find((c) => c.edge === "adsets").body;
      if (objective === "WHATSAPP")
        assert.deepEqual(whatsappSet.promoted_object, { page_id: q.pageId });
      if (objective === "TRAFFIC") assert(!("promoted_object" in whatsappSet));
    }
  } finally {
    MetaReader.prototype.launchRequest = old;
    globalThis.fetch = fetch;
    await db.creativeMetaLaunch.deleteMany({ where: { id: { in: drafts } } });
    await db.metaAdObject.deleteMany({
      where: { id: { in: [...objects.keys()] } },
    });
    await db.category.update({
      where: { id: category.id },
      data: { studio: category.studio as Prisma.InputJsonValue },
    });
    await db.$disconnect();
  }
});
test("AI suggestion requires consent, records one charge reservation, keeps protected fields, and never repeats an uncertain request", async () => {
  assert(/studio_columns_qa_\d+/.test(process.env.DATABASE_URL ?? ""));
  const q = JSON.parse(
      await readFile("/workspace/work/studio-columns-fixture.json", "utf8"),
    ),
    owner = await db.user.findUniqueOrThrow({ where: { id: q.users[0].id } });
  await db.rateLimit.deleteMany({
    where: { key: "campaign-suggestion:" + owner.id },
  });
  const a = adapter("openai"),
    old = a.direct,
    fetch = globalThis.fetch;
  let calls = 0,
    fail = false;
  const proposal = {
    body: "Consulta {diplomado}",
    description: "Información",
    audiences: [
      {
        name: "General",
        ageMin: 18,
        ageMax: 65,
        gender: "ALL",
        strictAge: false,
      },
    ],
  };
  a.direct = async () => {
    calls++;
    if (fail) throw Error("Lost reply");
    return {
      text: JSON.stringify(proposal),
      usage: { input_tokens: 2, output_tokens: 3 },
    };
  };
  globalThis.fetch = async () => {
    throw Error("External transport blocked");
  };
  const config = {
      accountId: q.accountId,
      pageId: q.pageId,
      country: "UY",
      dailyBudget: 10,
      body: "Body",
      headline: "Exact GHL {diplomado}",
      audiences: [{ name: "One" }],
    },
    ids = [randomUUID(), randomUUID()];
  const payload = (i = 0) => ({
    requestId: ids[i],
    categoryId: q.productId,
    confirmAi: true,
    prompt: "Propón públicos para {diplomado}",
    config,
    subproductIds: [q.images[0].subId],
  });
  try {
    await assert.rejects(() =>
      suggestCampaign(owner, { ...payload(), confirmAi: false }),
    );
    assert.equal(calls, 0);
    const r = await suggestCampaign(owner, payload());
    assert.equal(calls, 1);
    assert.deepEqual(Object.keys(r.proposal!).sort(), [
      "audiences",
      "body",
      "description",
    ]);
    await suggestCampaign(owner, payload());
    assert.equal(calls, 1);
    const ledger = await db.usageLedger.findUniqueOrThrow({
      where: { jobId: r.jobId },
    });
    assert.equal(ledger.status, "CONSUMED_ESTIMATE");
    fail = true;
    await assert.rejects(
      () => suggestCampaign(owner, payload(1)),
      /no se confirmó/i,
    );
    assert.equal(calls, 2);
    await assert.rejects(
      () => suggestCampaign(owner, payload(1)),
      /ya fue iniciada/i,
    );
    assert.equal(calls, 2);
    const uncertain = await db.generationJob.findUniqueOrThrow({
      where: {
        idempotencyKey: "campaign-suggestion:" + owner.id + ":" + ids[1],
      },
    });
    assert.equal(uncertain.status, "UNCERTAIN");
    assert.equal(
      (
        await db.usageLedger.findUniqueOrThrow({
          where: { jobId: uncertain.id },
        })
      ).status,
      "UNCERTAIN",
    );
  } finally {
    a.direct = old;
    globalThis.fetch = fetch;
    const jobs = await db.generationJob.findMany({
      where: {
        idempotencyKey: {
          in: ids.map((id) => "campaign-suggestion:" + owner.id + ":" + id),
        },
      },
      select: { id: true },
    });
    await db.usageLedger.deleteMany({
      where: { jobId: { in: jobs.map((j) => j.id) } },
    });
    await db.generationJob.deleteMany({
      where: { id: { in: jobs.map((j) => j.id) } },
    });
    await db.$disconnect();
  }
});
