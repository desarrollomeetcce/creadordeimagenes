import test from "node:test";
import assert from "node:assert/strict";
import {
  campaignConfigSchema,
  launchPlan,
  launchSummary,
  audienceTargeting,
  validateCampaignDestination,
  campaignObjective,
  campaignDestination,
} from "../lib/creative-studio/campaign-policy";
import {
  reusableCampaignSettings,
  campaignPresetSettingsSchema,
  placementSoftOptOut,
  templateForAnotherDiploma,
  whatsappConversationPayload,
} from "../lib/creative-studio/campaign-workbench-policy";
import { existingCampaignContext } from "../lib/creative-studio/campaign-existing";
import { verifyManualAudienceSelections } from "../lib/creative-studio/campaign-audience-selection";
import { encryptKey } from "../lib/crypto";
const config = (extra: any = {}) =>
  campaignConfigSchema.parse({
    accountId: "123",
    pageId: "456",
    country: "CO",
    dailyBudget: 7,
    body: "Conoce [diplomado]",
    headline: "Diplomado [diplomado] ★★★★★",
    audiences: [{ name: "A" }, { name: "B" }],
    planVersion: 2,
    ...extra,
  });
const item = {
  subproductId: "s",
  name: "Minería",
  variationIds: ["a", "b", "c", "d", "e", "f"],
};
test("Named configuration excludes operational data, budget, targeting and conversations", () => {
  const settings = reusableCampaignSettings({
    ...config({ existingCampaignId: "789", dailyBudget: 20 }),
    conversation: { name: "X", greeting: "Hola", autofill: "Info" },
    selectedImages: ["a"],
  });
  assert.deepEqual(
    Object.keys(settings).sort(),
    [
      "objective",
      "platforms",
      "placements",
      "multiAdvertiser",
      "allowExcludedPlacementSpend",
      "body",
      "headline",
      "description",
    ].sort(),
  );
  assert(
    !campaignPresetSettingsSchema.safeParse({ ...settings, dailyBudget: 20 })
      .success,
  );
  assert(
    !campaignPresetSettingsSchema.safeParse({ ...settings, country: "PE" })
      .success,
  );
  assert.equal(settings.multiAdvertiser, false);
  assert.equal(settings.allowExcludedPlacementSpend, false);
});
test("Reusing several adsets only creates the new ads, never creates or activates their parents", () => {
  const c = config({
    existingCampaignId: "789",
    existingAdsetIds: ["801", "802", "803"],
    audiences: [{ name: "Uno" }, { name: "Dos" }, { name: "Tres" }],
  });
  const plan = launchPlan([item], true, c),
    parents = plan.filter((s) => s.kind === "CAMPAIGN" || s.kind === "ADSET");
  assert.equal(parents.length, 4);
  assert(
    parents.every((s) => s.existing && s.state === "DONE" && s.receipt?.id),
  );
  assert.equal(plan.filter((s) => s.kind === "AD").length, 6);
  assert.equal(
    new Set(plan.filter((s) => s.kind === "AD").map((s) => s.image)).size,
    6,
  );
  assert(
    plan
      .filter((s) => s.kind === "ACTIVATE")
      .every((s) => !s.key.includes("campaign") && !s.key.includes("adset")),
  );
  assert.equal(launchSummary([item], c).dailyTotal, 0);
  assert(
    !campaignConfigSchema.safeParse({ ...c, existingCampaignId: undefined })
      .success,
  );
});
test("New adsets under an existing campaign preserve that parent and require independent ABO funding", async () => {
  const c = config({ existingCampaignId: "789", adsetDailyBudget: 10 });
  const plan = launchPlan([item], false, c);
  assert.equal(plan.filter((s) => s.kind === "ADSET" && !s.existing).length, 2);
  assert(plan.find((s) => s.kind === "CAMPAIGN")?.existing);
  assert.equal(launchSummary([item], c).dailyTotal, 20);
  const parent = {
    id: "789",
    account_id: "123",
    objective: "OUTCOME_ENGAGEMENT",
    status: "ACTIVE",
    effective_status: "ACTIVE",
    special_ad_categories: [],
  };
  const r = { launchRequest: async () => parent } as any;
  await existingCampaignContext(r, "123", c);
  await assert.rejects(
    () =>
      existingCampaignContext(r, "123", { ...c, adsetDailyBudget: undefined }),
    /presupuesto/,
  );
  await assert.rejects(() => existingCampaignContext(r, "999", c), /cuenta/);
});
test("Real targeting fields carry manual interests, custom audiences, city, language and placement IDs", () => {
  const c = config({
    platforms: ["facebook"],
    placements: { facebook: ["story"] },
    audiences: [
      {
        name: "A",
        ageMin: 25,
        ageMax: 55,
        gender: "WOMEN",
        advantageAudience: false,
        interests: [{ id: "6001", name: "Minería" }],
        customAudiences: [{ id: "7001", name: "Clientes" }],
        excludedCustomAudiences: [{ id: "7002", name: "Excluir" }],
        locales: [6],
        locations: [
          { id: "8001", name: "Bogotá", country: "CO", kind: "cities" },
        ],
      },
    ],
  });
  const t: Record<string, any> = audienceTargeting(c, 0);
  assert.deepEqual(t.flexible_spec, [
    { interests: [{ id: "6001", name: "Minería" }] },
  ]);
  assert.deepEqual(t.facebook_positions, ["story"]);
  assert.deepEqual(t.geo_locations, { cities: [{ key: "8001" }] });
  assert.deepEqual(t.custom_audiences, [{ id: "7001" }]);
  assert.deepEqual(t.excluded_custom_audiences, [{ id: "7002" }]);
  assert.deepEqual(t.locales, [6]);
  assert.deepEqual(t.genders, [2]);
  assert.equal(t.targeting_automation.advantage_audience, 0);
  validateCampaignDestination(c);
  assert(
    Object.values(placementSoftOptOut(c)).every(
      (v) => Array.isArray(v) && v.length === 0,
    ),
  );
});
test("WhatsApp leads and welcome messages serialize actual Meta fields while keeping the headline manual", () => {
  const c = config({ objective: "LEADS_WHATSAPP" });
  assert.equal(campaignObjective(c), "OUTCOME_LEADS");
  assert.equal(campaignDestination(c), "WHATSAPP");
  const payload = JSON.parse(
    whatsappConversationPayload(
      {
        name: "Consulta",
        greeting: "Hola [diplomado]",
        autofill: "Me interesa",
      },
      (s) => s.replace("[diplomado]", "Minería"),
    ),
  );
  assert.equal(payload.type, "VISUAL_EDITOR");
  assert.equal(payload.text_format.message.text, "Hola Minería");
  assert.equal(
    payload.text_format.message.autofill_message.content,
    "Me interesa",
  );
  const next = templateForAnotherDiploma({
    headline: "OPERACIONES MINERAS",
    body: "Oferta MINERAS",
    campaignName: "MINERAS",
  });
  assert.equal(next.headline, "{diplomado}");
  assert.equal(next.campaignName, "{pais} · {diplomado}");
  assert(!next.body.includes("MINERAS"));
});
test("Manual Meta selections reject forged, expired and cross-account IDs and canonicalize returned names", () => {
  process.env.AI_MASTER_KEY =
    process.env.AI_MASTER_KEY || Buffer.alloc(32, 8).toString("base64");
  const actor = { id: "actor" } as any,
    account = { id: "123", connectionId: "conn", connection: { revision: 2 } };
  const proof = (extra: any = {}) =>
    encryptKey(
      JSON.stringify({
        v: 1,
        actorId: "actor",
        accountId: "123",
        connectionId: "conn",
        revision: 2,
        country: "CO",
        kind: "interests",
        expiresAt: Date.now() + 60000,
        items: [{ id: "6001", name: "Minería real" }],
        ...extra,
      }),
      "studio:audience-selection:v1",
    );
  const c = config({
    audiences: [
      {
        name: "A",
        interestSource: "MANUAL",
        interests: [{ id: "6001", name: "Inventado" }],
        selectionProofs: [proof()],
      },
    ],
  });
  assert.equal(
    verifyManualAudienceSelections(actor, account, c)[0].interests?.[0].name,
    "Minería real",
  );
  assert.throws(
    () => verifyManualAudienceSelections(actor, { ...account, id: "999" }, c),
    /autorización/,
  );
  assert.throws(
    () =>
      verifyManualAudienceSelections(actor, account, {
        ...c,
        audiences: [
          { ...c.audiences[0], selectionProofs: [proof({ expiresAt: 1 })] },
        ],
      }),
    /venció/,
  );
  assert.throws(
    () =>
      verifyManualAudienceSelections(actor, account, {
        ...c,
        audiences: [
          { ...c.audiences[0], interests: [{ id: "9999", name: "Fake" }] },
        ],
      }),
    /confirmados/,
  );
  assert.throws(
    () =>
      verifyManualAudienceSelections(actor, account, {
        ...c,
        audiences: [
          {
            ...c.audiences[0],
            platformPresetId: "a6cf5fde-120c-4f34-82c2-cab44b48703a",
          },
        ],
      }),
    /autorizado/,
  );
});

test("Interest lookup uses Meta targetingsearch with bounded search, bearer authorization and no writes", async () => {
  const { MetaReader } = await import("../lib/meta-ads/provider");
  const old = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (input, init) => {
    calls++;
    const u = new URL(String(input));
    assert.equal(u.pathname, "/v26.0/act_123/targetingsearch");
    assert.equal(u.searchParams.get("type"), "adinterest");
    assert.equal(u.searchParams.get("q"), "minería");
    assert.equal(u.searchParams.get("limit"), "20");
    assert(!u.searchParams.has("access_token"));
    assert.equal(
      new Headers(init?.headers).get("Authorization"),
      "Bearer synthetic-only",
    );
    assert.equal(init?.method, "GET");
    return Response.json({
      data: [{ id: "6001", name: "Minería" }],
      paging: {
        cursors: { after: "next" },
        next: "https://graph.facebook.com/next",
      },
    });
  };
  try {
    const reader = new MetaReader("synthetic-only", "API", "v26.0");
    assert.equal(
      (
        await reader.campaignDirectory("123", "interests", {
          query: "minería",
          country: "CO",
        })
      ).data[0].id,
      "6001",
    );
    await assert.rejects(() =>
      reader.campaignDirectory("123", "interests", { query: "x" }),
    );
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = old;
  }
});
test("Campaign text generation honors the explicit output allowance instead of truncating multiple audiences", async () => {
  const { adapter } = await import("../lib/providers");
  const old = globalThis.fetch;
  let cap = 0;
  globalThis.fetch = async (_input, init) => {
    cap = JSON.parse(String(init?.body)).max_output_tokens;
    return Response.json({
      output: [{ content: [{ type: "output_text", text: "{}" }] }],
      usage: { input_tokens: 1, output_tokens: 1 },
    });
  };
  try {
    await adapter("openai").direct(
      "synthetic-only",
      "gpt-5-mini",
      "QA",
      false,
      undefined,
      "low",
      4500,
    );
    assert.equal(cap, 4500);
  } finally {
    globalThis.fetch = old;
  }
});

test("Unified detailed targeting preserves Meta field types, OR grouping and proof-bound identities", () => {
  process.env.AI_MASTER_KEY =
    process.env.AI_MASTER_KEY || Buffer.alloc(32, 8).toString("base64");
  const actor = { id: "actor" } as any,
    account = { id: "123", connectionId: "conn", connection: { revision: 2 } };
  const selected = [
    { id: "10", name: "Parents", field: "family_statuses" },
    { id: "20", name: "Water treatment", field: "interests" },
    { id: "30", name: "Engaged shoppers", field: "behaviors" },
  ];
  const proof = encryptKey(
    JSON.stringify({
      v: 1,
      actorId: "actor",
      accountId: "123",
      connectionId: "conn",
      revision: 2,
      country: "CO",
      kind: "detailed",
      expiresAt: Date.now() + 60000,
      items: selected,
    }),
    "studio:audience-selection:v1",
  );
  const c = config({
    audiences: [
      { name: "A", detailedTargeting: selected, selectionProofs: [proof] },
    ],
  });
  const verified = verifyManualAudienceSelections(actor, account, c);
  assert.deepEqual(verified[0].detailedTargeting, selected);
  const target = audienceTargeting({ ...c, audiences: verified }, 0) as any;
  assert.deepEqual(target.flexible_spec, [
    {
      family_statuses: [{ id: "10", name: "Parents" }],
      interests: [{ id: "20", name: "Water treatment" }],
      behaviors: [{ id: "30", name: "Engaged shoppers" }],
    },
  ]);
  assert.throws(
    () =>
      verifyManualAudienceSelections(actor, account, {
        ...c,
        audiences: [
          {
            ...c.audiences[0],
            detailedTargeting: [
              { id: "10", name: "Parents", field: "interests" },
            ],
          },
        ],
      }),
    /confirmada por Meta/,
  );
  assert.throws(
    () => validateCampaignDestination({ ...c, specialCategory: "EMPLOYMENT" }),
    /categorías especiales/,
  );
  assert(
    !campaignConfigSchema.safeParse({
      ...c,
      audiences: [
        {
          ...c.audiences[0],
          detailedTargeting: [{ id: "10", name: "Fake", field: "politics" }],
        },
      ],
    }).success,
  );
});
test("Unified search and category browse use documented read-only Meta endpoints with bounded results", async () => {
  const { MetaReader } = await import("../lib/meta-ads/provider");
  const old = globalThis.fetch;
  const calls: URL[] = [];
  globalThis.fetch = async (input, init) => {
    const u = new URL(String(input));
    calls.push(u);
    assert.equal(init?.method, "GET");
    assert(!u.searchParams.has("access_token"));
    assert.equal(u.searchParams.get("limit"), "20");
    return Response.json({ data: [] });
  };
  try {
    const reader = new MetaReader("synthetic-only", "API", "v26.0");
    await reader.campaignDirectory("123", "detailed", {
      query: "tratamiento de aguas",
      country: "CO",
    });
    assert.equal(calls[0].pathname, "/v26.0/act_123/targetingsearch");
    assert(
      JSON.parse(calls[0].searchParams.get("whitelisted_types")!).includes(
        "family_statuses",
      ),
    );
    assert.deepEqual(JSON.parse(calls[0].searchParams.get("countries")!), [
      "CO",
    ]);
    assert(!calls[0].searchParams.has("type"));
    await reader.campaignDirectory("123", "detailed", {
      browse: "demographics",
      after: "cursor",
    });
    assert.equal(calls[1].pathname, "/v26.0/search");
    assert.equal(calls[1].searchParams.get("type"), "adTargetingCategory");
    assert.equal(calls[1].searchParams.get("class"), "demographics");
    assert.equal(calls[1].searchParams.get("after"), "cursor");
    assert(!calls[1].searchParams.has("q"));
    await assert.rejects(() =>
      reader.campaignDirectory("123", "detailed", { query: "a" }),
    );
    assert.equal(calls.length, 2);
  } finally {
    globalThis.fetch = old;
  }
});

test("Category dictionaries use explicit Meta field keys and never infer demographics from names", async () => {
  const { detailedMetaRows } =
    await import("../lib/creative-studio/detailed-targeting");
  assert.deepEqual(
    detailedMetaRows({
      family_statuses: [{ id: "1", name: "Padres" }],
      unknown: [{ id: "2", name: "Padres (revista)" }],
    }),
    [
      { id: "1", name: "Padres", type: "family_statuses" },
      { id: "2", name: "Padres (revista)" },
    ],
  );
  assert.equal(
    detailedMetaRows(
      Array.from({ length: 100 }, (_, i) => ({
        id: String(i),
        name: "N",
        type: "interests",
      })),
    ).length,
    50,
  );
});
