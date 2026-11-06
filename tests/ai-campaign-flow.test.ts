import test from "node:test";
import assert from "node:assert/strict";
import {
  aiCampaignConfig,
  createAiPausedCampaigns,
} from "../lib/creative-studio/ai-campaign-flow";
import {
  campaignConfigSchema,
  campaignDisplayName,
} from "../lib/creative-studio/campaign-policy";
const c = () => ({
  ...campaignConfigSchema.parse({
    accountId: "123",
    pageId: "456",
    country: "CO",
    dailyBudget: 10,
    body: "old",
    headline: "ACCEDE {diplomado} ★★★★★",
    campaignName: "Mi campaña {diplomado}",
    audiences: [{ name: "1" }, { name: "2" }],
  }),
  body: "",
  description: "",
});
const items = [
  { subproductId: "s", name: "Colorimetría", variationIds: ["v1", "v2"] },
];
const proposal = {
  body: "Consulta {diplomado}",
  description: "Descripción IA",
  audiences: [
    {
      name: "General",
      ageMin: 18,
      ageMax: 65,
      gender: "ALL",
      strictAge: false,
    },
    { name: "Otro", ageMin: 25, ageMax: 65, gender: "ALL", strictAge: false },
  ],
};
function setup(config = c()) {
  const calls: any[] = [];
  let saved: any;
  return {
    calls,
    options: {
      requestId: "same-request",
      categoryId: "category",
      config,
      items,
      prompt: "",
      isCurrent: () => true,
      onProposal: () => {},
      onPrepared: () => {},
      request: async (path: string, method: string, body: any) => {
        calls.push({ path, method, body });
        if (path === "/campaign-suggestion") return { proposal };
        if (path === "/launches") {
          saved = body.config;
          return { id: "launch", revision: 2, config: saved, status: "DRAFT" };
        }
        return { id: "launch", config: saved, status: "PUBLISHING" };
      },
    },
  };
}
test("Empty manual text does not block AI; single action generates copy and starts only paused publication", async () => {
  const { calls, options } = setup();
  const result = await createAiPausedCampaigns(options);
  assert.equal(result.status, "PUBLISHING");
  assert.deepEqual(
    calls.map((c) => c.path),
    ["/campaign-suggestion", "/launches", "/launches/launch/publish"],
  );
  const config = calls[1].body.config;
  assert.equal(config.body, proposal.body);
  assert.equal(config.description, proposal.description);
  assert.equal(config.headline, c().headline);
  assert.equal(config.targetStatus, "PAUSED");
  assert.equal(calls[2].body.confirmSpend, false);
  assert.equal(calls[0].body.requestId, calls[1].body.requestId);
  assert(calls[0].body.prompt.length > 0);
});
test("Missing required fields are named before any paid AI or Meta request", async () => {
  const { calls, options } = setup({ ...c(), pageId: "", dailyBudget: 0 });
  await assert.rejects(
    () => createAiPausedCampaigns(options),
    /página de Facebook.*presupuesto/,
  );
  assert.equal(calls.length, 0);
});
test("Manual optional description, headline, platforms and campaign name are respected", async () => {
  const { calls, options } = setup({
    ...c(),
    description: "Descripción exacta",
    targetStatus: "ACTIVE",
    platforms: ["facebook"],
  });
  await createAiPausedCampaigns(options);
  const config = calls[1].body.config;
  assert.equal(config.description, "Descripción exacta");
  assert.equal(config.headline, c().headline);
  assert.equal(config.targetStatus, "PAUSED");
  assert.deepEqual(config.platforms, ["facebook"]);
  assert.equal(
    campaignDisplayName(items[0], config),
    "Mi campaña Colorimetría",
  );
});
test("Generated copy can be reused after interrupted publication without another AI charge", async () => {
  const { calls, options } = setup();
  await createAiPausedCampaigns({ ...options, proposal });
  assert(!calls.some((c) => c.path === "/campaign-suggestion"));
});
test("Changed selection stops before creating remote campaigns", async () => {
  const { calls, options } = setup();
  await assert.rejects(
    () => createAiPausedCampaigns({ ...options, isCurrent: () => false }),
    /Cambió/,
  );
  assert.equal(calls.length, 1);
});
test("Unexpected active draft is never published by the AI paused flow", async () => {
  const { calls, options } = setup();
  const request = options.request;
  await assert.rejects(
    () =>
      createAiPausedCampaigns({
        ...options,
        request: async (...args: Parameters<typeof request>) => {
          const r = await request(...args);
          if (args[0] === "/launches") r.config.targetStatus = "ACTIVE";
          return r;
        },
      }),
    /pausada/,
  );
  assert(!calls.some((c) => c.path.endsWith("/publish")));
});
test("Uneven or insufficient image distribution is rejected before AI", () => {
  assert.throws(() =>
    aiCampaignConfig(c(), [{ ...items[0], variationIds: ["v1"] }]),
  );
});

test("Verified Meta interest selection carries the server job proof into the launch", async () => {
  const { calls, options } = setup();
  const prior = options.request;
  await createAiPausedCampaigns({
    ...options,
    request: async (...args: Parameters<typeof prior>) => {
      const r = await prior(...args);
      if (args[0] === "/campaign-suggestion")
        return { ...r, jobId: "verified-source-job" };
      return r;
    },
  });
  assert.equal(
    calls.find((c) => c.path === "/launches").body.config.aiSuggestionJobId,
    "verified-source-job",
  );
});
