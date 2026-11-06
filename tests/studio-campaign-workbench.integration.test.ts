import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { db } from "../lib/db";
import { MetaReader } from "../lib/meta-ads/provider";
import { campaignAudienceOptions } from "../lib/creative-studio/campaign-audience-selection";
import {
  savePlatformAudience,
  platformAudiencePresets,
  resolvePlatformAudiencePresets,
} from "../lib/creative-studio/campaign-audience-presets";
import {
  campaignPresets,
  saveCampaignPreset,
} from "../lib/creative-studio/campaign-presets";
import {
  createLaunch,
  beginLaunch,
  tickLaunch,
} from "../lib/creative-studio/campaigns";
import { campaignConfigSchema } from "../lib/creative-studio/campaign-policy";
import { reusableCampaignSettings } from "../lib/creative-studio/campaign-workbench-policy";
test("Meta interests -> named platform public -> existing sets with real serialized targeting and common ads; mocked providers only", async () => {
  assert(/studio_columns_qa_\d+/.test(process.env.DATABASE_URL ?? ""));
  const q = JSON.parse(
      await readFile("/workspace/work/studio-columns-fixture.json", "utf8"),
    ),
    owner = await db.user.findUniqueOrThrow({ where: { id: q.users[0].id } }),
    oldDirectory = MetaReader.prototype.campaignDirectory,
    oldLaunch = MetaReader.prototype.launchRequest;
  const project = await db.project.findUniqueOrThrow({
    where: { id: q.projectId },
  });
  await db.project.update({
    where: { id: q.projectId },
    data: {
      studio: {
        ...(project.studio as any),
        audiencePresets: [],
        campaignPresets: [],
        conversationTemplates: [],
      },
    },
  });
  let seq = 920000000;
  const calls: any[] = [],
    objects = new Map<string, any>(),
    drafts: string[] = [];
  const parent = {
    id: "910000000",
    name: "Campaña previa",
    account_id: q.accountId,
    objective: "OUTCOME_ENGAGEMENT",
    status: "ACTIVE",
    effective_status: "ACTIVE",
    daily_budget: "2000",
    special_ad_categories: [],
  };
  objects.set(parent.id, parent);
  for (const id of ["910000001", "910000002", "910000003"])
    objects.set(id, {
      id,
      name: "Conjunto previo " + id,
      account_id: q.accountId,
      campaign_id: parent.id,
      status: "ACTIVE",
      effective_status: "ACTIVE",
      destination_type: "WHATSAPP",
      optimization_goal: "CONVERSATIONS",
      targeting: {
        geo_locations: { countries: ["UY"] },
        publisher_platforms: ["facebook"],
      },
      promoted_object: { page_id: q.pageId },
    });
  MetaReader.prototype.campaignDirectory = async function (
    account,
    kind,
    input,
  ) {
    assert.equal(account, q.accountId);
    assert.equal(kind, "interests");
    assert.equal(input?.query, "minería");
    return {
      data: [
        { id: "600001", name: "Ingeniería de minas" },
        { id: "600002", name: "Minería" },
      ],
      after: undefined,
    };
  };
  MetaReader.prototype.launchRequest = async function (
    account,
    edge,
    body,
    id,
  ) {
    assert.equal(account, q.accountId);
    calls.push({ edge, body, id });
    if (edge === "promote_pages")
      return { data: [{ id: q.pageId, name: "QA" }] };
    if (edge === "objects")
      return Object.fromEntries(
        id!.split(",").map((id) => [id, objects.get(id)]),
      );
    if (edge === "object" && !body) return objects.get(id!)!;
    if (edge === "object" && body) {
      Object.assign(objects.get(id!)!, body, { effective_status: body.status });
      return { success: true };
    }
    if (edge === "adimages")
      return { images: { qa: { hash: "b".repeat(32) } } };
    if (edge === "adsets") {
      assert.equal((body as any).targeting.age_max, 65);
      assert.equal((body as any).targeting.age_min, 25);
      assert.deepEqual((body as any).targeting.age_range, [35, 45]);
      assert.equal(
        (body as any).targeting.targeting_automation.advantage_audience,
        1,
      );
    }
    const next = String(++seq);
    objects.set(next, {
      ...body,
      id: next,
      account_id: account,
      effective_status: body?.status ?? "PAUSED",
    });
    return { id: next };
  };
  try {
    const options = await campaignAudienceOptions(owner, q.accountId, {
      kind: "interests",
      q: "minería",
      country: "UY",
    });
    assert.equal(options.items[0].name, "Ingeniería de minas");
    const audience = {
      name: "Especialistas",
      ageMin: 35,
      ageMax: 45,
      gender: "ALL",
      strictAge: false,
      advantageAudience: true,
      interestSource: "MANUAL",
      interests: [{ id: "600001", name: "Nombre manipulado" }],
      selectionProofs: [options.proof],
    };
    const save = {
      requestId: randomUUID(),
      categoryId: q.productId,
      name: "Minería Uruguay",
      country: "UY",
      audience,
      platforms: ["facebook"],
      specialCategory: "NONE",
    };
    const saved = await savePlatformAudience(owner, q.accountId, save);
    assert.equal(saved.audience.interests?.[0].name, "Ingeniería de minas");
    assert.deepEqual(
      await savePlatformAudience(owner, q.accountId, save),
      saved,
    );
    assert.equal(
      (
        await platformAudiencePresets(owner, q.productId, {
          accountId: q.accountId,
          country: "UY",
        })
      ).items.length,
      1,
    );
    assert.equal(
      (
        await platformAudiencePresets(owner, q.productId, {
          accountId: q.accountId,
          country: "CL",
        })
      ).items.length,
      0,
    );
    const config = campaignConfigSchema.parse({
      accountId: q.accountId,
      pageId: q.pageId,
      country: "UY",
      dailyBudget: 7,
      body: "Información de [diplomado]",
      headline: "Diplomado [diplomado] ★★★★★",
      description: "Inscríbete",
      platforms: ["facebook"],
      audiences: [
        { name: "Nuevo A", platformPresetId: saved.id },
        { name: "Nuevo B", platformPresetId: saved.id },
      ],
      planVersion: 2,
      conversation: {
        name: "Consulta",
        greeting: "Hola, conoce [diplomado]",
        autofill: "Quiero información",
      },
    });
    const account = await db.metaAdAccount.findUniqueOrThrow({
      where: { id: q.accountId },
      include: { connection: true },
    });
    await assert.rejects(
      () =>
        resolvePlatformAudiencePresets(account, q.productId, {
          ...config,
          country: "CL",
        }),
      /cuenta y país/,
    );
    const preset = {
      id: randomUUID(),
      name: "WhatsApp habitual",
      settings: reusableCampaignSettings(config),
    };
    const first = await saveCampaignPreset(owner, q.productId, preset);
    assert.deepEqual(
      await saveCampaignPreset(owner, q.productId, preset),
      JSON.parse(JSON.stringify(first)),
    );
    assert(!("dailyBudget" in ("settings" in first ? first.settings : {})));
    await assert.rejects(
      () => saveCampaignPreset(owner, q.productId, { ...preset, name: "Otro" }),
      /cambió/,
    );
    assert.equal((await campaignPresets(owner, q.productId)).presets.length, 1);
    const conversation = {
      id: randomUUID(),
      name: "Bienvenida",
      settings: { greeting: "Hola [diplomado]", autofill: "Información" },
    };
    const conv = await saveCampaignPreset(
      owner,
      q.productId,
      conversation,
      "conversation",
    );
    assert.deepEqual(
      await saveCampaignPreset(
        owner,
        q.productId,
        conversation,
        "conversation",
      ),
      conv,
    );
    const items = [
      {
        subproductId: q.subIds[0],
        variationIds: q.images
          .filter((v: any) => v.subId === q.subIds[0])
          .map((v: any) => v.id),
      },
    ];
    for (const mode of ["new", "existing-sets", "existing-campaign"] as const) {
      const cfg = {
        ...config,
        ...(mode === "new" ? {} : { existingCampaignId: parent.id }),
        ...(mode === "existing-sets"
          ? {
              existingAdsetIds: ["910000001", "910000002", "910000003"],
              audiences: [{ name: "A" }, { name: "B" }, { name: "C" }],
            }
          : {}),
      };
      const start = calls.length;
      const d = await createLaunch(owner, {
        requestId: randomUUID(),
        categoryId: q.productId,
        config: cfg,
        items,
      });
      drafts.push(d.id);
      let state = await beginLaunch(owner, d.id, {
        revision: d.revision,
        confirmPublish: true,
      });
      for (let i = 0; i < 100 && state.status === "PUBLISHING"; i++)
        state = await tickLaunch(owner, d.id);
      assert.equal(state.status, "PUBLISHED", state.error ?? "");
      const writes = calls.slice(start).filter((c) => c.body),
        sets = writes.filter((c) => c.edge === "adsets"),
        creatives = writes.filter((c) => c.edge === "adcreatives"),
        ads = writes.filter((c) => c.edge === "ads");
      assert.equal(ads.length, 3);
      assert.equal(creatives.length, 3);
      assert.equal(sets.length, mode === "existing-sets" ? 0 : 2);
      assert.equal(
        writes.filter((c) => c.edge === "campaigns").length,
        mode === "new" ? 1 : 0,
      );
      assert(!writes.some((c) => c.edge === "object"));
      for (const c of creatives) {
        assert.equal(c.body.contextual_multi_ads.enroll_status, "OPT_OUT");
        assert.equal(
          c.body.object_story_spec.link_data.name,
          "Diplomado Criminalística Internacional ★★★★★",
        );
        const welcome = JSON.parse(
          c.body.object_story_spec.link_data.page_welcome_message,
        );
        assert.equal(
          welcome.text_format.message.autofill_message.content,
          "Quiero información",
        );
      }
      for (const c of sets) {
        assert.deepEqual(c.body.targeting.age_range, [35, 45]);
        assert.equal(c.body.targeting.age_min, 25);
        assert.equal(c.body.targeting.age_max, 65);
        assert.equal(
          c.body.targeting.targeting_automation.advantage_audience,
          1,
        );
        assert.deepEqual(c.body.targeting.flexible_spec, [
          { interests: [{ id: "600001", name: "Ingeniería de minas" }] },
        ]);
        assert.deepEqual(c.body.targeting.publisher_platforms, ["facebook"]);
        assert(
          Object.values(c.body.placement_soft_opt_out).every(
            (v: any) => Array.isArray(v) && v.length === 0,
          ),
        );
      }
    }
    assert.deepEqual(objects.get(parent.id), parent);
    console.log(
      "PASS real Meta interest IDs canonicalized, local saved audience trusted by account/country, named presets idempotent,3 complete paused campaign modes,9 creatives/ads, existing parents untouched",
    );
  } finally {
    MetaReader.prototype.campaignDirectory = oldDirectory;
    MetaReader.prototype.launchRequest = oldLaunch;
    await db.creativeMetaLaunch.deleteMany({ where: { id: { in: drafts } } });
    await db.$disconnect();
  }
});

test("Selective AI description leaves manual copy, headline and audiences unchanged and never requests Meta interests or publishes", async () => {
  const { suggestCampaign } =
    await import("../lib/creative-studio/campaign-suggestion");
  const { adapter } = await import("../lib/providers");
  const q = JSON.parse(
      await readFile("/workspace/work/studio-columns-fixture.json", "utf8"),
    ),
    owner = await db.user.findUniqueOrThrow({ where: { id: q.users[0].id } }),
    a = adapter("openai"),
    old = a.direct,
    oldInterests = MetaReader.prototype.targetingInterests;
  let calls = 0;
  const requestId = randomUUID();
  a.direct = async (
    _key,
    _model,
    _prompt,
    _structured,
    _signal,
    level,
    maxTokens,
  ) => {
    calls++;
    assert.equal(level, "low");
    assert.equal(maxTokens, 4500);
    return {
      text: JSON.stringify({
        body: "Texto que no se debe aplicar",
        description: "Descripción nueva",
      }),
      usage: { input_tokens: 1, output_tokens: 1 },
    };
  };
  MetaReader.prototype.targetingInterests = async () => {
    throw Error("Description-only must not search interests");
  };
  try {
    const config = campaignConfigSchema.parse({
      accountId: q.accountId,
      pageId: q.pageId,
      country: "UY",
      dailyBudget: 7,
      body: "Texto manual exacto",
      headline: "Headline manual exacto ★★★★★",
      audiences: [{ name: "Público manual" }],
    });
    const before = await db.creativeMetaLaunch.count({
      where: { categoryId: q.productId },
    });
    const r = await suggestCampaign(owner, {
      requestId,
      categoryId: q.productId,
      confirmAi: true,
      fields: { audiences: false, body: false, description: true },
      prompt: "Descripción para [diplomado]",
      config,
      subproductIds: [q.subIds[0]],
    });
    assert.equal(calls, 1);
    assert.equal(r.proposal?.body, config.body);
    assert.equal(r.proposal?.description, "Descripción nueva");
    assert.deepEqual(r.proposal?.audiences, config.audiences);
    assert.equal(
      await db.creativeMetaLaunch.count({ where: { categoryId: q.productId } }),
      before,
    );
    console.log(
      "PASS copy-only AI uses one call, preserves manual targeting/text, creates no publication",
    );
  } finally {
    a.direct = old;
    MetaReader.prototype.targetingInterests = oldInterests;
    const job = await db.generationJob.findUnique({
      where: {
        idempotencyKey: "campaign-suggestion:" + owner.id + ":" + requestId,
      },
    });
    if (job) {
      await db.usageLedger.deleteMany({ where: { jobId: job.id } });
      await db.generationJob.delete({ where: { id: job.id } });
    }
    await db.$disconnect();
  }
});

test("Explicit AI checks generate audiences, body, headline, description and a NEW compatible welcome message without publishing", async () => {
  const { suggestCampaign } =
    await import("../lib/creative-studio/campaign-suggestion");
  const { adapter } = await import("../lib/providers");
  const q = JSON.parse(
      await readFile("/workspace/work/studio-columns-fixture.json", "utf8"),
    ),
    owner = await db.user.findUniqueOrThrow({ where: { id: q.users[0].id } }),
    a = adapter("openai"),
    old = a.direct,
    oldInterests = MetaReader.prototype.targetingInterests,
    oldLaunch = MetaReader.prototype.launchRequest;
  const id = randomUUID();
  let calls = 0,
    draftId = "";
  MetaReader.prototype.targetingInterests = async () => [
    { id: "700001", name: "Medio ambiente" },
    { id: "700002", name: "Tratamiento de aguas" },
  ];
  MetaReader.prototype.launchRequest = async (_account, edge, body) => {
    assert.equal(edge, "promote_pages");
    assert.equal(body, undefined);
    return { data: [{ id: q.pageId, name: "QA" }] };
  };
  a.direct = async (_key, _model, prompt) => {
    calls++;
    return {
      text: JSON.stringify(
        prompt.includes("consultas breves")
          ? { queries: ["medio ambiente", "tratamiento de aguas"] }
          : {
              body: "Consulta por [diplomado]",
              description: "Nueva descripción",
              headline: "Diplomado [diplomado] ★★★★★",
              conversation: {
                name: "Bienvenida nueva",
                greeting: "Hola, conoce [diplomado]",
                autofill: "Quiero información",
              },
              audiences: [
                {
                  name: "Ambiente",
                  ageMin: 18,
                  ageMax: 65,
                  gender: "ALL",
                  strictAge: false,
                  interests: [{ id: "700001", name: "Medio ambiente" }],
                },
                {
                  name: "Agua",
                  ageMin: 25,
                  ageMax: 65,
                  gender: "ALL",
                  strictAge: false,
                  interests: [{ id: "700002", name: "Tratamiento de aguas" }],
                },
              ],
            },
      ),
      usage: { input_tokens: 1, output_tokens: 1 },
    };
  };
  try {
    const config = campaignConfigSchema.parse({
      accountId: q.accountId,
      pageId: q.pageId,
      country: "UY",
      dailyBudget: 7,
      headline: "Manual anterior",
      body: "Manual anterior",
      audiences: [{ name: "A" }, { name: "B" }],
      planVersion: 2,
    });
    const r = await suggestCampaign(owner, {
      requestId: id,
      categoryId: q.productId,
      confirmAi: true,
      fields: {
        audiences: true,
        body: true,
        description: true,
        headline: true,
        conversation: true,
      },
      prompt: "Públicos y anuncios para [diplomado]",
      config,
      subproductIds: [q.subIds[0]],
    });
    assert.equal(calls, 2);
    assert.equal(r.proposal!.headline, "Diplomado [diplomado] ★★★★★");
    assert.equal(r.proposal!.conversation!.name, "Bienvenida nueva");
    const d = await createLaunch(owner, {
      requestId: randomUUID(),
      categoryId: q.productId,
      config: { ...config, ...r.proposal, aiSuggestionJobId: r.jobId },
      items: [
        {
          subproductId: q.subIds[0],
          variationIds: q.images
            .filter((v: any) => v.subId === q.subIds[0])
            .map((v: any) => v.id),
        },
      ],
    });
    draftId = d.id;
    assert.equal(d.status, "DRAFT");
    assert(d.config.conversation);
    assert.equal(d.config.conversation.autofill, "Quiero información");
    assert.equal(d.config.headline, r.proposal!.headline);
    assert.equal(d.summary.ads, 3);
    console.log(
      "PASS all five AI checks generate required values; new welcome and shared headline reach validated draft, no writes to Meta or template library",
    );
  } finally {
    a.direct = old;
    MetaReader.prototype.targetingInterests = oldInterests;
    MetaReader.prototype.launchRequest = oldLaunch;
    if (draftId) await db.creativeMetaLaunch.delete({ where: { id: draftId } });
    const job = await db.generationJob.findUnique({
      where: { idempotencyKey: "campaign-suggestion:" + owner.id + ":" + id },
    });
    if (job) {
      await db.usageLedger.deleteMany({ where: { jobId: job.id } });
      await db.generationJob.delete({ where: { id: job.id } });
    }
    await db.$disconnect();
  }
});
test("Detailed options expose only supported Meta-returned fields and preserve paths and identity proofs", async () => {
  const { verifyManualAudienceSelections } =
    await import("../lib/creative-studio/campaign-audience-selection");
  const q = JSON.parse(
      await readFile("/workspace/work/studio-columns-fixture.json", "utf8"),
    ),
    owner = await db.user.findUniqueOrThrow({ where: { id: q.users[0].id } }),
    old = MetaReader.prototype.campaignDirectory;
  MetaReader.prototype.campaignDirectory = async () => ({
    data: [
      {
        id: "800001",
        name: "Padres",
        type: "family_statuses",
        path: ["Datos demográficos", "Padres"],
        audience_size_lower_bound: 100,
        audience_size_upper_bound: 200,
      },
      {
        id: "800002",
        name: "Agua",
        type: "interests",
        path: ["Intereses", "Ambiente"],
      },
      { id: "800003", name: "No compatible", type: "politics" },
    ],
    after: "next",
  });
  try {
    const r = await campaignAudienceOptions(owner, q.accountId, {
      kind: "detailed",
      q: "medio ambiente",
      country: "UY",
    });
    assert.equal(r.items.length, 2);
    assert.equal(r.items[0].field, "family_statuses");
    assert.deepEqual(r.items[0].path, ["Datos demográficos", "Padres"]);
    assert.equal(r.items[0].audienceLower, 100);
    const account = await db.metaAdAccount.findUniqueOrThrow({
        where: { id: q.accountId },
        include: { connection: true },
      }),
      config = campaignConfigSchema.parse({
        accountId: q.accountId,
        pageId: q.pageId,
        country: "UY",
        dailyBudget: 7,
        body: "Información",
        headline: "Diplomado",
        audiences: [
          {
            name: "A",
            detailedTargeting: [
              { id: "800001", name: "Nombre falso", field: "family_statuses" },
            ],
            selectionProofs: [r.proof],
          },
        ],
      });
    assert.equal(
      verifyManualAudienceSelections(owner, account, config)[0]
        .detailedTargeting?.[0].name,
      "Padres",
    );
    assert.equal(r.after, "next");
  } finally {
    MetaReader.prototype.campaignDirectory = old;
    await db.$disconnect();
  }
});
