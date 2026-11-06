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
  resumeLaunchWait,
  getLaunch,
} from "../lib/creative-studio/campaigns";
import { MetaQuotaWait } from "../lib/meta-ads/quota";
import { MetaGraphError } from "../lib/meta-ads/graph-error";
import { legacyPacingMessage } from "../lib/creative-studio/launch-wait";
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
  let waitInjection: "pacing" | "quota" | null = null;
  let retiredVerification = true;
  const objects = new Map<string, any>(),
    calls: any[] = [],
    drafts: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input)),
      params = new URLSearchParams(String(init?.body));
    assert.equal(url.hostname, "graph.facebook.com");
    assert.equal(init?.method, "POST");
    assert(!url.searchParams.has("ids") && !params.has("ids"));
    const batch = JSON.parse(params.get("batch")!);
    assert(batch.length <= 25);
    return Response.json(
      batch.map((part: any) => {
        assert.equal(part.method, "GET");
        const u = new URL(part.relative_url, "https://graph.facebook.com/");
        assert(!u.searchParams.has("ids"));
        const value = objects.get(u.pathname.slice(1));
        assert(value);
        return { code: 200, body: JSON.stringify(value) };
      }),
    );
  };
  MetaReader.prototype.launchRequest = async function (
    account,
    edge,
    body,
    id,
    fields,
  ) {
    assert.equal(account, q.accountId);
    if (edge === "adcreatives" && waitInjection) {
      const reason = waitInjection;
      waitInjection = null;
      throw new MetaQuotaWait(new Date(Date.now() + 60000), reason);
    }
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
    if (edge === "objects") {
      if (retiredVerification) {
        retiredVerification = false;
        throw new MetaGraphError(
          500,
          {
            error: {
              code: 100,
              message: "The ids query parameter is deprecated in v26.0+.",
            },
          },
          "synthetic",
          { version: "v26.0", endpoint: "", fields: fields!, method: "GET" },
        );
      }
      return old.call(this, account, edge, body, id, fields);
    }
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
      if (objective !== "TRAFFIC") {
        waitInjection = objective === "WHATSAPP" ? "pacing" : "quota";
        while (state.status === "PUBLISHING" && state.current !== "CREATIVE")
          state = await tickLaunch(owner, d.id);
        const confirmed = state.completed;
        state = await tickLaunch(owner, d.id); // Local wait, no creative sent.
        assert.equal(state.status, "PUBLISHING");
        assert.equal(state.waiting, true);
        assert.equal(state.error, null);
        assert.equal(
          state.waitReason,
          objective === "WHATSAPP" ? "pacing" : "quota",
        );
        const stored = await db.creativeMetaLaunch.findUniqueOrThrow({
          where: { id: d.id },
        });
        const saved = stored.steps as any[];
        assert.equal(saved.find((s) => s.state !== "DONE").state, "PENDING");
        const count = calls.length;
        const unchanged = await tickLaunch(owner, d.id);
        assert.equal(unchanged.revision, state.revision);
        assert.equal(unchanged.completed, confirmed);
        assert.equal(
          calls.length,
          count,
          "No requests before the durable wait expires",
        );
        if (objective === "WHATSAPP") {
          const legacy = structuredClone(saved);
          legacy.find((s) => s.state !== "DONE").state = "UNCERTAIN";
          await db.creativeMetaLaunch.update({
            where: { id: d.id },
            data: {
              steps: legacy,
              status: "NEEDS_REVIEW",
              error: legacyPacingMessage,
            },
          });
          assert.equal((await getLaunch(owner, d.id)).canResumeWait, true);
          await assert.rejects(
            () =>
              resumeLaunchWait(owner, d.id, { revision: state.revision - 1 }),
            /revisi[oó]n/,
          );
          state = await resumeLaunchWait(owner, d.id, {
            revision: state.revision,
          });
          assert.equal(state.completed, confirmed);
          assert.equal(
            calls.length,
            count,
            "Explicit recovery only changes durable state",
          );
          const unknown = await db.creativeMetaLaunch.create({
            data: {
              actorId: owner.id,
              projectId: q.projectId,
              categoryId: q.productId,
              requestId: randomUUID(),
              accountId: q.accountId,
              connectionId: stored.connectionId,
              connectionRevision: stored.connectionRevision,
              config: stored.config as Prisma.InputJsonValue,
              campaigns: stored.campaigns as Prisma.InputJsonValue,
              steps: legacy,
              status: "NEEDS_REVIEW",
              error: "Network timeout: result unknown",
            },
          });
          drafts.push(unknown.id);
          assert.equal(
            (await getLaunch(owner, unknown.id)).canResumeWait,
            false,
          );
          await assert.rejects(
            () =>
              resumeLaunchWait(owner, unknown.id, {
                revision: unknown.revision,
              }),
            /revisi[oó]n/,
          );
          await tickLaunch(owner, unknown.id);
          assert.equal(
            calls.length,
            count,
            "An uncertain network result is never retried",
          );
        } else {
          saved.find((s) => s.state !== "DONE").wait.until = new Date(
            Date.now() - 1,
          ).toISOString();
          await db.creativeMetaLaunch.update({
            where: { id: d.id },
            data: { steps: saved },
          });
        }
      }
      for (let i = 0; i < 25 && state.status === "PUBLISHING"; i++)
        state = await tickLaunch(owner, d.id);
      if (state.canResumeVerification) {
        assert.equal(state.status, "NEEDS_REVIEW");
        const before = calls.filter((c) =>
          ["campaigns", "adsets", "ads", "adcreatives"].includes(c.edge),
        ).length;
        state = await resumeLaunchWait(owner, d.id, {
          revision: state.revision,
        });
        state = await tickLaunch(owner, d.id);
        for (let i = 0; i < 25 && state.status === "PUBLISHING"; i++)
          state = await tickLaunch(owner, d.id);
        assert.equal(
          calls.filter((c) =>
            ["campaigns", "adsets", "ads", "adcreatives"].includes(c.edge),
          ).length,
          before,
          "Resume repeats verification reads only; all created object IDs remain unchanged",
        );
      }
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
  const previousLaunch = MetaReader.prototype.launchRequest;
  const preparedIds: string[] = [];
  MetaReader.prototype.launchRequest = async (_account, edge, body) => {
    assert.equal(body, undefined);
    assert.equal(edge, "promote_pages");
    return { data: [{ id: q.pageId, name: "QA page" }] };
  };
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
        interests: [{ id: "700001", name: "Colorimetría" }],
      },
    ],
  };
  const oldInterests = MetaReader.prototype.targetingInterests;
  MetaReader.prototype.targetingInterests = async () => [
    { id: "700001", name: "Colorimetría" },
    { id: "700002", name: "Peluquería" },
  ];
  a.direct = async (_key, _model, prompt) => {
    calls++;
    if (fail) throw Error("Lost reply");
    return {
      text: JSON.stringify(
        prompt.includes("queries")
          ? { queries: ["Colorimetry", "Hair coloring"] }
          : proposal,
      ),
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
    assert.equal(calls, 2);
    assert.deepEqual(Object.keys(r.proposal!).sort(), [
      "audiences",
      "body",
      "description",
    ]);
    await suggestCampaign(owner, payload());
    assert.equal(calls, 2);
    const ledger = await db.usageLedger.findUniqueOrThrow({
      where: { jobId: r.jobId },
    });
    assert.equal(ledger.status, "CONSUMED_ESTIMATE");
    const prepare = (audiences: any, proof?: string) =>
      createLaunch(owner, {
        requestId: randomUUID(),
        categoryId: q.productId,
        config: { ...config, audiences, aiSuggestionJobId: proof },
        items: [
          { subproductId: q.images[0].subId, variationIds: [q.images[0].id] },
        ],
      });
    await assert.rejects(() => prepare(r.proposal.audiences), /requieren/);
    await assert.rejects(
      () =>
        prepare(
          [
            {
              ...r.proposal.audiences[0],
              interests: [{ id: "999999", name: "Unverified" }],
            },
          ],
          r.jobId,
        ),
      /no confirmó/,
    );
    const prepared = await prepare(r.proposal.audiences, r.jobId);
    preparedIds.push(prepared.id);
    assert.equal(prepared.config.audiences[0].interests?.[0]?.id, "700001");

    fail = true;
    await assert.rejects(
      () => suggestCampaign(owner, payload(1)),
      /no se confirmó/i,
    );
    assert.equal(calls, 3);
    await assert.rejects(
      () => suggestCampaign(owner, payload(1)),
      /ya fue iniciada/i,
    );
    assert.equal(calls, 3);
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
    MetaReader.prototype.launchRequest = previousLaunch;
    await db.creativeMetaLaunch.deleteMany({
      where: { id: { in: preparedIds } },
    });
    MetaReader.prototype.targetingInterests = oldInterests;
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
